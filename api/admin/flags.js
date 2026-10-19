import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY))
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://cpmwall3.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // 1. JWT & Role Authorization (No x-admin-key)
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    
    if (!token) return res.status(401).json({ error: "Unauthorized: Missing token" });

    const decoded = verifyJwt(token);
    if (!decoded || !decoded.username) return res.status(401).json({ error: "Unauthorized: Invalid token" });

    const adminUsername = String(decoded.username).toUpperCase();
    const adminRef = db.collection("users").doc(adminUsername);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists || adminDoc.data().role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Insufficient role permissions" });
    }

    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";

    // --- GET: List Feature Flags ---
    if (req.method === "GET") {
      const snapshot = await db.collection("feature_flags").get();
      let flags = [];
      snapshot.forEach(doc => {
        flags.push({ key: doc.id, ...doc.data() });
      });
      return res.status(200).json({ flags });
    }

    // --- POST: Create, Update, or Delete Feature Flags ---
    if (req.method === "POST") {
      const { action, key, enabled, description } = req.body || {};
      
      if (!key) return res.status(400).json({ error: "Flag key is required" });
      
      // Sanitize the document ID to prevent invalid path injections
      const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, "");

      if (action === "set") {
        await db.collection("feature_flags").doc(safeKey).set({
          enabled: Boolean(enabled),
          description: String(description || ""),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await db.collection("audit_logs").add({
          adminUsername,
          action: "SET_FEATURE_FLAG",
          method: "POST",
          ip: rawIp,
          metadata: { key: safeKey, enabled: Boolean(enabled) },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, key: safeKey, enabled: Boolean(enabled) });
      }

      if (action === "delete") {
        await db.collection("feature_flags").doc(safeKey).delete();

        await db.collection("audit_logs").add({
          adminUsername,
          action: "DELETE_FEATURE_FLAG",
          method: "POST",
          ip: rawIp,
          metadata: { key: safeKey },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, key: safeKey, deleted: true });
      }

      return res.status(400).json({ error: "Invalid action" });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
