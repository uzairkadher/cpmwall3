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

    // --- GET: List Sessions ---
    if (req.method === "GET") {
      const targetUsername = req.query.username ? String(req.query.username).toUpperCase() : null;
      let queryRef = db.collection("sessions").orderBy("createdAt", "desc").limit(100);
      const snapshot = await queryRef.get();
      let sessions = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const uname = String(d.username || "").toUpperCase();
        if (!targetUsername || uname === targetUsername) {
          sessions.push({ id: doc.id, ...d });
        }
      });
      return res.status(200).json({ sessions });
    }

    // --- POST: Revoke Session ---
    if (req.method === "POST") {
      const { action, sessionId } = req.body || {};
      
      if (action === "revoke") {
        if (!sessionId) return res.status(400).json({ error: "Session ID required" });
        
        const sessionRef = db.collection("sessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        
        if (!sessionDoc.exists) return res.status(404).json({ error: "Session not found" });
        const sessionData = sessionDoc.data();
        
        // Delete the session document to revoke
        await sessionRef.delete();
        
        await db.collection("audit_logs").add({
          adminUsername,
          action: "REVOKE_SESSION",
          method: "POST",
          ip: rawIp,
          metadata: { sessionId, targetUser: sessionData.username || "unknown" },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({ success: true, sessionId, revoked: true });
      }
      
      return res.status(400).json({ error: "Invalid action" });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
