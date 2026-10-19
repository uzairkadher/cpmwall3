import admin from "firebase-admin";
import crypto from "crypto";
import { verifyJwt } from "../auth.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY))
  });
}

const db = admin.firestore();

function generateKeyString(type) {
  const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ES-${type}-${p1}-${p2}`;
}

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

    // --- GET: List VIP Keys ---
    if (req.method === "GET") {
      const snapshot = await db.collection("vip_keys").orderBy("createdAt", "desc").limit(100).get();
      let keys = [];
      snapshot.forEach(doc => {
        keys.push({ id: doc.id, ...doc.data() });
      });
      return res.status(200).json({ keys });
    }

    // --- POST: VIP Key Management Actions ---
    if (req.method === "POST") {
      const { action } = req.body || {};

      if (action === "create") {
        const type = req.body.type === "ULTRA" ? "ULTRA" : "VIP";
        const count = Math.min(20, Math.max(1, Number(req.body.count) || 1));
        const durationDays = Math.max(1, Number(req.body.durationDays) || 30);

        const batch = db.batch();
        const generated = [];

        for (let i = 0; i < count; i++) {
          const newKey = generateKeyString(type);
          const keyRef = db.collection("vip_keys").doc(newKey);
          batch.set(keyRef, {
            key: newKey,
            type: type,
            createdBy: adminUsername,
            usedBy: null,
            usedAt: null,
            active: true,
            durationDays: durationDays,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          generated.push(newKey);
        }

        await batch.commit();

        await db.collection("audit_logs").add({
          adminUsername,
          action: "GENERATE_VIP_KEYS",
          method: "POST",
          ip: rawIp,
          metadata: { count, type, durationDays },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, count, generated });
      }

      if (action === "revoke") {
        const keyId = req.body.key;
        if (!keyId) return res.status(400).json({ error: "Key required" });
        
        await db.collection("vip_keys").doc(keyId).delete();
        
        await db.collection("audit_logs").add({
          adminUsername,
          action: "REVOKE_VIP_KEY",
          method: "POST",
          ip: rawIp,
          metadata: { keyId },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, key: keyId, revoked: true });
      }

      if (action === "toggle") {
        const keyId = req.body.key;
        if (!keyId) return res.status(400).json({ error: "Key required" });
        
        const keyRef = db.collection("vip_keys").doc(keyId);
        const keyDoc = await keyRef.get();
        if (!keyDoc.exists) return res.status(404).json({ error: "Key not found" });
        
        const newActiveState = !keyDoc.data().active;
        await keyRef.update({ active: newActiveState });

        await db.collection("audit_logs").add({
          adminUsername,
          action: "TOGGLE_VIP_KEY",
          method: "POST",
          ip: rawIp,
          metadata: { keyId, active: newActiveState },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, key: keyId, active: newActiveState });
      }

      return res.status(400).json({ error: "Invalid action" });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
