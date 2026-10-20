import crypto from "crypto";
import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

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

const VALID_ROLES = ["ADMIN", "VIP", "USER", "MOD"];
const MAX_BAN_HOURS = 24 * 365;

function getDb() {
  if (!process.env.FIREBASE_SERVICE_KEY) {
    throw new Error("Firebase configuration missing.");
  }
  if (!admin.apps.length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
    } catch {
      throw new Error("Firebase configuration invalid.");
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

function cleanText(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength) || fallback;
}

function getClientIp(req) {
  const candidate =
    req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "";
  const ip = String(candidate).split(",")[0].trim();
  if (
    ip.length > 64 ||
    !/^[a-fA-F0-9:.]+$/.test(ip)
  ) {
    return "unknown";
  }
  return ip;
}

function parsePositiveHours(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const hours = Number(value);
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > MAX_BAN_HOURS
  ) {
    return undefined;
  }
  return hours;
}

function safeUserRecord(doc) {
  const data = doc.data() || {};
  // Explicit allowlist: never return arbitrary private user fields.
  return {
    username: doc.id,
    role: data.role || "USER",
    isVip: Boolean(data.isVip),
    isVerified: Boolean(data.isVerified),
    isBanned: Boolean(data.isBanned),
    bannedReason: cleanText(data.bannedReason, 250),
    createdAt: data.createdAt || null,
    lastUsernameChange: data.lastUsernameChange || null,
    vipExpiresAt: data.vipExpiresAt || null
  };
}

async function writeAudit(db, data) {
  await db.collection("audit_logs").add({
    ...data,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
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

    const adminRef = db.collection("users").doc(adminUsername);
    const adminSnap = await adminRef.get();

    if (
      !adminSnap.exists ||
      adminSnap.data()?.role !== "ADMIN"
    ) {
      return res.status(403).json({ error: "Admin permission required." });
    }

    const rawIp = getClientIp(req);

    if (req.method === "GET") {
      const q = cleanText(req.query?.q, 20).toUpperCase();
      const roleFilter = cleanText(req.query?.role, 20).toUpperCase();
      const limit = Math.min(
        100,
        Math.max(1, Number(req.query?.limit) || 50)
      );
      const page = Math.min(
        10000,
        Math.max(1, Number(req.query?.page) || 1)
      );

      if (roleFilter && !VALID_ROLES.includes(roleFilter)) {
        return res.status(400).json({ error: "Invalid role filter." });
      }

      // Avoid scanning an arbitrary pool and presenting incomplete
      // results as a complete user directory.
      const snapshot = await db
        .collection("users")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(500)
        .get();

      const filtered = snapshot.docs.filter(doc => {
        const data = doc.data() || {};
        const username = doc.id.toUpperCase();
        if (q && !username.includes(q)) return false;
        if (roleFilter && (data.role || "USER") !== roleFilter) {
          return false;
        }
        return true;
      });

      const start = (page - 1) * limit;
      const users = filtered
        .slice(start, start + limit)
        .map(safeUserRecord);

      return res.status(200).json({
        users,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
        truncated: snapshot.size === 500
      });
    }

    const body =
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
        ? req.body
        : {};

    const action = cleanText(body.action, 40);
    const targetUsername = cleanUsername(body.targetUsername);

    if (!targetUsername) {
      return res.status(400).json({ error: "Valid target username required." });
    }
    if (targetUsername === adminUsername) {
      return res.status(400).json({ error: "Cannot modify your own account." });
    }

    const targetRef = db.collection("users").doc(targetUsername);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return res.status(404).json({ error: "Target user not found." });
    }

    const targetData = targetSnap.data() || {};

    if (action === "update_role") {
      const role = cleanText(body.role, 20).toUpperCase();
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: "Invalid role." });
      }

      // Prevent demoting the last administrator.
      if (targetData.role === "ADMIN" && role !== "ADMIN") {
        const admins = await db
          .collection("users")
          .where("role", "==", "ADMIN")
          .limit(2)
          .get();
        if (admins.size <= 1) {
          return res.status(409).json({
            error: "Cannot remove the last administrator."
          });
        }
      }

      await targetRef.update({ role });

      await writeAudit(db, {
        adminUsername,
        action: "UPDATE_USER_ROLE",
        method: "POST",
        ip: rawIp,
        targetUser: targetUsername,
        metadata: { newRole: role }
      });

      return res.status(200).json({
        success: true,
        target: targetUsername,
        role
      });
    }

    if (action === "ban") {
      const reason = cleanText(body.reason, 250, "Administrative ban");
      const hours = parsePositiveHours(body.hours);

      if (hours === undefined) {
        return res.status(400).json({
          error: `Ban duration must be between 1 hour and ${MAX_BAN_HOURS} hours.`
        });
      }

      // Do not accept an arbitrary banIp from the browser. Use only
      // an IP already associated with the target's server-side record.
      const ipToBan =
        typeof targetData.ip === "string" &&
        targetData.ip.length <= 64
          ? targetData.ip
          : "";

      const bannedUntil = hours === null
        ? null
        : admin.firestore.Timestamp.fromMillis(
            Date.now() + hours * 60 * 60 * 1000
          );

      const batch = db.batch();

      batch.update(targetRef, {
        isBanned: true,
        bannedReason: reason,
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        bannedUntil
      });

      if (ipToBan && ipToBan !== "unknown") {
        batch.set(
          db.collection("banned").doc(
            crypto.createHash("sha256").update(ipToBan).digest("hex")
          ),
          {
            ip: ipToBan,
            username: targetUsername,
            reason,
            bannedAt: admin.firestore.FieldValue.serverTimestamp(),
            bannedUntil
          },
          { merge: true }
        );
      }

      batch.set(db.collection("audit_logs").doc(), {
        adminUsername,
        action: "BAN_USER",
        method: "POST",
        ip: rawIp,
        targetUser: targetUsername,
        metadata: {
          reason,
          hours: hours === null ? "Permanent" : hours
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      return res.status(200).json({
        success: true,
        target: targetUsername,
        isBanned: true
      });
    }

    return res.status(400).json({ error: "Invalid action." });

  } catch (error) {
    console.error("Admin users API failure:", error?.message || "Unknown error");
    return res.status(500).json({
      error: "An internal server error occurred."
    });
  }
}