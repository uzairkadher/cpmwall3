import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

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
const ALLOWED_ORIGIN = "https://cpmwall3.vercel.app";
const FLAG_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX_DESCRIPTION_LENGTH = 500;

function getClientIp(req) {
  // Vercel supplies x-forwarded-for. Use the first address in that header.
  // Only trust forwarded headers when requests arrive through your trusted host.
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 100);
  }

  return String(req.socket?.remoteAddress || "unknown").slice(0, 100);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
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

    if (!decoded || typeof decoded.username !== "string") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const adminUsername = decoded.username.trim().toUpperCase();

    if (!adminUsername) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify the current role in Firestore on every request.
    const adminDoc = await db.collection("users").doc(adminUsername).get();

    if (!adminDoc.exists || adminDoc.data()?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (req.method === "GET") {
      const snapshot = await db.collection("feature_flags").get();

      const flags = snapshot.docs.map((doc) => ({
        key: doc.id,
        ...doc.data(),
      }));

      return res.status(200).json({ flags });
    }

    const body = req.body || {};
    const { action, key, enabled, description } = body;

    if (typeof key !== "string" || !FLAG_KEY_PATTERN.test(key)) {
      return res.status(400).json({
        error:
          "Flag key must be 1–100 characters and contain only letters, numbers, underscores, or hyphens",
      });
    }

    if (action !== "set" && action !== "delete") {
      return res.status(400).json({ error: "Invalid action" });
    }

    const flagRef = db.collection("feature_flags").doc(key);
    const ip = getClientIp(req);

    if (action === "set") {
      if (typeof enabled !== "boolean") {
        return res.status(400).json({
          error: "The enabled field must be a boolean",
        });
      }

      if (
        description !== undefined &&
        typeof description !== "string"
      ) {
        return res.status(400).json({
          error: "Description must be a string",
        });
      }

      const safeDescription = (description || "").trim();

      if (safeDescription.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({
          error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
        });
      }

      await flagRef.set(
        {
          enabled,
          description: safeDescription,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("audit_logs").add({
        adminUsername,
        action: "SET_FEATURE_FLAG",
        method: "POST",
        ip,
        metadata: {
          key,
          enabled,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        key,
        enabled,
      });
    }

    const existingFlag = await flagRef.get();

    if (!existingFlag.exists) {
      return res.status(404).json({ error: "Feature flag not found" });
    }

    await flagRef.delete();

    await db.collection("audit_logs").add({
      adminUsername,
      action: "DELETE_FEATURE_FLAG",
      method: "POST",
      ip,
      metadata: { key },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      key,
      deleted: true,
    });
  } catch (err) {
    console.error("Admin feature flags request failed:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}