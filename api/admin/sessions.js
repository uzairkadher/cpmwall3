
import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

const ALLOWED_ORIGIN = "https://cpmwall3.vercel.app";
const MAX_RESULTS = 100;

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
  if (req.headers.origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function cleanUsername(value) {
  if (typeof value !== "string") return "";

  const username = value.trim().toUpperCase();

  return /^[A-Z0-9_.]{3,20}$/.test(username)
    ? username
    : "";
}

function getClientIp(req) {
  const candidate =
    req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "";

  const ip = String(candidate).split(",")[0].trim();

  return ip.length <= 64 && /^[a-fA-F0-9:.]+$/.test(ip)
    ? ip
    : "unknown";
}

function safeSessionRecord(doc) {
  const data = doc.data() || {};

  // Explicit allowlist. Never return the complete session document,
  // which could contain tokens or other sensitive fields.
  return {
    id: doc.id,
    username: cleanUsername(data.username) || "UNKNOWN",
    createdAt: data.createdAt || null,
    lastSeen: data.lastSeen || null,
    expiresAt: data.expiresAt || null,
    device: typeof data.device === "string"
      ? data.device.slice(0, 100)
      : null,
    browser: typeof data.browser === "string"
      ? data.browser.slice(0, 100)
      : null,
    os: typeof data.os === "string"
      ? data.os.slice(0, 100)
      : null,
    active: data.active === true
  };
}

async function writeAudit(db, record) {
  await db.collection("audit_logs").add({
    ...record,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    if (req.headers.origin && req.headers.origin !== ALLOWED_ORIGIN) {
      return res.status(403).end();
    }

    return res.status(204).end();
  }

  if (req.headers.origin && req.headers.origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
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
      return res.status(401).json({ error: "Authentication required." });
    }

    let decoded;

    try {
      decoded = verifyJwt(match[1]);
    } catch {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    const adminUsername = cleanUsername(decoded?.username);

    if (!adminUsername) {
      return res.status(401).json({ error: "Invalid session." });
    }

    // Never trust a JWT role claim alone. Read the current role from
    // Firestore so a demoted admin loses administrative API access.
    const adminSnap = await db
      .collection("users")
      .doc(adminUsername)
      .get();

    if (
      !adminSnap.exists ||
      adminSnap.data()?.role !== "ADMIN"
    ) {
      return res.status(403).json({
        error: "Admin permission required."
      });
    }

    if (req.method === "GET") {
      const rawTarget = req.query?.username;
      const targetUsername = rawTarget
        ? cleanUsername(String(rawTarget))
        : "";

      if (rawTarget && !targetUsername) {
        return res.status(400).json({ error: "Invalid username." });
      }

      let query = db.collection("sessions");

      if (targetUsername) {
        query = query.where("username", "==", targetUsername);
      }

      const snapshot = await query
        .orderBy("createdAt", "desc")
        .limit(MAX_RESULTS)
        .get();

      const sessions = snapshot.docs.map(safeSessionRecord);

      return res.status(200).json({
        sessions,
        limit: MAX_RESULTS,
        truncated: snapshot.size === MAX_RESULTS
      });
    }

    const body =
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
        ? req.body
        : {};

    if (body.action !== "revoke") {
      return res.status(400).json({ error: "Invalid action." });
    }

    const sessionId =
      typeof body.sessionId === "string"
        ? body.sessionId.trim()
        : "";

    if (
      !sessionId ||
      sessionId.length > 1500 ||
      sessionId.includes("/")
    ) {
      return res.status(400).json({ error: "Invalid session ID." });
    }

    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: "Session not found." });
    }

    const sessionData = sessionSnap.data() || {};
    const targetUsername =
      cleanUsername(sessionData.username) || "UNKNOWN";

    // Delete the session and record the action together.
    // This does not by itself invalidate a stateless JWT unless
    // the authentication middleware checks session validity.
    const batch = db.batch();

    batch.delete(sessionRef);

    batch.set(db.collection("audit_logs").doc(), {
      adminUsername,
      action: "REVOKE_SESSION",
      method: "POST",
      ip: getClientIp(req),
      targetUser: targetUsername,
      metadata: {
        sessionId
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return res.status(200).json({
      success: true,
      sessionId,
      revoked: true,
      warning:
        "Session record deleted. JWT invalidation depends on authentication middleware."
    });
  } catch (error) {
    console.error(
      "Admin sessions API failure:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      error: "An internal server error occurred."
    });
  }
}
