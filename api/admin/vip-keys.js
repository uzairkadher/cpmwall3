import admin from "firebase-admin";
import crypto from "crypto";
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

if (!admin.apps.length) {
  const serviceKey = process.env.FIREBASE_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("Server configuration error");
  }
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceKey)),
  });
}

const db = admin.firestore();
const MAX_KEYS_PER_REQUEST = 20;
const MAX_DURATION_DAYS = 3650;
const KEY_PATTERN = /^ES-(VIP|ULTRA)-[A-F0-9]{4}-[A-F0-9]{4}$/;

function generateKeyString(type) {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `ES-${type}-${p1}-${p2}`;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 100);
  }
  return String(req.socket?.remoteAddress || "unknown").slice(0, 100);
}

function validKeyId(value) {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Cache-Control", "private, no-store");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
      return res.status(403).end();
    }
    return res.status(200).end();
  }

  if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!(await isSessionActive(db, decoded))) {
      return res.status(401).json({ error: "Session revoked." });
    }
    if (typeof decoded.username !== "string") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const adminUsername = decoded.username.trim().toUpperCase();
    if (!adminUsername) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check the current Firestore role, not a role claim from the JWT.
    const adminDoc = await db.collection("users").doc(adminUsername).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (req.method === "GET") {
      const snapshot = await db
        .collection("vip_keys")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      const keys = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.status(200).json({ keys });
    }

    const body = req.body || {};
    const { action } = body;
    const ip = getClientIp(req);

    if (action === "create") {
      const type = body.type === "ULTRA" ? "ULTRA" : "VIP";
      const countValue = body.count === undefined ? 1 : Number(body.count);
      const durationValue =
        body.durationDays === undefined ? 30 : Number(body.durationDays);

      if (
        !Number.isInteger(countValue) ||
        countValue < 1 ||
        countValue > MAX_KEYS_PER_REQUEST
      ) {
        return res.status(400).json({
          error: `Count must be an integer between 1 and ${MAX_KEYS_PER_REQUEST}`,
        });
      }

      if (
        !Number.isInteger(durationValue) ||
        durationValue < 1 ||
        durationValue > MAX_DURATION_DAYS
      ) {
        return res.status(400).json({
          error: `Duration must be an integer between 1 and ${MAX_DURATION_DAYS} days`,
        });
      }

      const batch = db.batch();
      const generated = [];

      for (let i = 0; i < countValue; i++) {
        const newKey = generateKeyString(type);
        const keyRef = db.collection("vip_keys").doc(newKey);
        batch.create(keyRef, {
          key: newKey,
          type,
          createdBy: adminUsername,
          usedBy: null,
          usedAt: null,
          active: true,
          durationDays: durationValue,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        generated.push(newKey);
      }

      await batch.commit();

      await db.collection("audit_logs").add({
        adminUsername,
        action: "GENERATE_VIP_KEYS",
        method: "POST",
        ip,
        metadata: {
          count: countValue,
          type,
          durationDays: durationValue,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        count: countValue,
        generated,
      });
    }

    if (action === "revoke") {
      const keyId = body.key;
      if (!validKeyId(keyId)) {
        return res.status(400).json({ error: "Invalid VIP key" });
      }

      const keyRef = db.collection("vip_keys").doc(keyId);
      const keyDoc = await keyRef.get();

      if (!keyDoc.exists) {
        return res.status(404).json({ error: "Key not found" });
      }

      await keyRef.delete();

      await db.collection("audit_logs").add({
        adminUsername,
        action: "REVOKE_VIP_KEY",
        method: "POST",
        ip,
        metadata: { keyId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        key: keyId,
        revoked: true,
      });
    }

    if (action === "toggle") {
      const keyId = body.key;
      if (!validKeyId(keyId)) {
        return res.status(400).json({ error: "Invalid VIP key" });
      }

      const keyRef = db.collection("vip_keys").doc(keyId);

      const result = await db.runTransaction(async (transaction) => {
        const keyDoc = await transaction.get(keyRef);
        if (!keyDoc.exists) {
          return { notFound: true };
        }

        const newActiveState = keyDoc.data().active !== true;
        transaction.update(keyRef, {
          active: newActiveState,
        });

        return { active: newActiveState };
      });

      if (result.notFound) {
        return res.status(404).json({ error: "Key not found" });
      }

      await db.collection("audit_logs").add({
        adminUsername,
        action: "TOGGLE_VIP_KEY",
        method: "POST",
        ip,
        metadata: {
          keyId,
          active: result.active,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        key: keyId,
        active: result.active,
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (err) {
    console.error("Admin VIP key request failed:", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
