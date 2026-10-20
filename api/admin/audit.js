import admin from "firebase-admin";
import { isSessionActive, verifyJwt } from "../auth.js";

const ALLOWED_ORIGINS = [
  "https://cpmwall.tech",
  "https://www.cpmwall.tech",
  "https://cpmwall3.vercel.app",
  "http://localhost:3000"
];

function isOriginAllowed(origin) {
  if (!origin || origin === "null" || origin === "file://") return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

const MAX_LOGS = 300;

function getDb() {
  if (!process.env.FIREBASE_SERVICE_KEY) {
    throw new Error("Firebase service configuration is missing.");
  }
  if (!admin.apps.length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
    } catch {
      throw new Error("Firebase service configuration is invalid.");
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  return admin.firestore();
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Cache-Control", "no-store");
}

function cleanUsername(value) {
  if (typeof value !== "string") return "";
  const username = value.trim().toUpperCase();
  return /^[A-Z0-9_.]{3,20}$/.test(username)
    ? username
    : "";
}

function parseDate(value) {
  if (typeof value !== "string" || value.length > 40) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function serializeLog(doc) {
  const data = doc.data() || {};
  const metadata =
    data.metadata &&
    typeof data.metadata === "object" &&
    !Array.isArray(data.metadata)
      ? data.metadata
      : {};

  // Return an explicit allowlist instead of spreading the complete
  // Firestore document into the response.
  return {
    id: doc.id,
    action: typeof data.action === "string"
      ? data.action.slice(0, 100)
      : "UNKNOWN",
    adminUsername: cleanUsername(data.adminUsername) || "UNKNOWN",
    targetUser: cleanUsername(data.targetUser) || null,
    method: typeof data.method === "string"
      ? data.method.slice(0, 20)
      : null,
    timestamp: serializeTimestamp(data.timestamp),
    metadata: {
      newRole: typeof metadata.newRole === "string"
        ? metadata.newRole.slice(0, 20)
        : undefined,
      reason: typeof metadata.reason === "string"
        ? metadata.reason.slice(0, 250)
        : undefined,
      hours:
        typeof metadata.hours === "number" ||
        typeof metadata.hours === "string"
          ? metadata.hours
          : undefined,
      sessionId: typeof metadata.sessionId === "string"
        ? metadata.sessionId.slice(0, 150)
        : undefined
    }
  };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
      return res.status(403).end();
    }
    return res.status(200).end();
  }

  if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let db;
  try {
    db = getDb();
  } catch {
    return res.status(500).json({ error: "Server configuration error." });
  }

  try {
    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer\s+(\S+)$/);

    if (!match) {
      return res.status(401).json({
        error: "Authentication required."
      });
    }

    let decoded;
    try {
      decoded = verifyJwt(match[1]);
    } catch {
      return res.status(401).json({
        error: "Invalid or expired session."
      });
    }

    if (!decoded) {
      return res.status(401).json({ error: "Invalid session." });
    }
    if (!(await isSessionActive(db, decoded))) {
      return res.status(401).json({ error: "Session revoked." });
    }

    const adminUsername = cleanUsername(decoded.username);
    if (!adminUsername) {
      return res.status(401).json({ error: "Invalid session." });
    }

    // Check the current role in Firestore rather than trusting a role
    // embedded in a potentially old JWT.
    const adminDoc = await db
      .collection("users")
      .doc(adminUsername)
      .get();

    if (
      !adminDoc.exists ||
      adminDoc.data()?.role !== "ADMIN"
    ) {
      return res.status(403).json({
        error: "Admin permission required."
      });
    }

    const actionValue = req.query?.action;
    const userValue = req.query?.userId;
    const startValue = req.query?.start;
    const endValue = req.query?.end;

    const filterAction = actionValue
      ? String(actionValue).trim().toUpperCase()
      : "";

    if (filterAction && filterAction.length > 100) {
      return res.status(400).json({ error: "Invalid action filter." });
    }

    const filterUserId = userValue
      ? cleanUsername(String(userValue))
      : "";

    if (userValue && !filterUserId) {
      return res.status(400).json({ error: "Invalid username filter." });
    }

    const filterStart = startValue
      ? parseDate(String(startValue))
      : null;
    const filterEnd = endValue
      ? parseDate(String(endValue))
      : null;

    if (startValue && filterStart === null) {
      return res.status(400).json({ error: "Invalid start date." });
    }
    if (endValue && filterEnd === null) {
      return res.status(400).json({ error: "Invalid end date." });
    }
    if (
      filterStart !== null &&
      filterEnd !== null &&
      filterStart > filterEnd
    ) {
      return res.status(400).json({
        error: "Start date must not be after end date."
      });
    }

    // Fetch a bounded, newest-first pool. Filtering happens within this
    // pool, so filtered results may be incomplete when more than 300
    // audit records exist.
    const snapshot = await db
      .collection("audit_logs")
      .orderBy("timestamp", "desc")
      .limit(MAX_LOGS)
      .get();

    const logs = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      const action = String(data.action || "").toUpperCase();
      const actor = cleanUsername(data.adminUsername);
      const target = cleanUsername(data.targetUser);
      const metadataTarget = cleanUsername(data.metadata?.targetUser);

      if (filterAction && action !== filterAction) {
        continue;
      }

      if (
        filterUserId &&
        actor !== filterUserId &&
        target !== filterUserId &&
        metadataTarget !== filterUserId
      ) {
        continue;
      }

      const timestamp = serializeTimestamp(data.timestamp);

      if (filterStart !== null || filterEnd !== null) {
        if (!timestamp) continue;
        const logTime = Date.parse(timestamp);
        if (filterStart !== null && logTime < filterStart) {
          continue;
        }
        if (filterEnd !== null && logTime > filterEnd) {
          continue;
        }
      }

      logs.push(serializeLog(doc));
    }

    return res.status(200).json({
      logs,
      limit: MAX_LOGS,
      scanned: snapshot.size,
      truncated: snapshot.size === MAX_LOGS
    });

  } catch (error) {
    console.error(
      "Admin audit API failure:",
      error?.message || "Unknown error"
    );
    return res.status(500).json({
      error: "An internal server error occurred."
    });
  }
}
