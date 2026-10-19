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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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

    // --- GET: List Audit Logs ---
    const filterAction = req.query.action ? String(req.query.action).toUpperCase() : null;
    const filterUserId = req.query.userId ? String(req.query.userId).toUpperCase() : null;
    const filterStart = req.query.start ? new Date(req.query.start).getTime() : null;
    const filterEnd = req.query.end ? new Date(req.query.end).getTime() : null;

    // Fetch base pool (ordered by timestamp desc to avoid composite index requirements)
    const queryRef = db.collection("audit_logs").orderBy("timestamp", "desc").limit(300);
    const snapshot = await queryRef.get();
    
    let logs = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      let match = true;

      // Action Filter
      if (filterAction && String(d.action || "").toUpperCase() !== filterAction) {
        match = false;
      }

      // UserId Filter (matches either the acting admin or the target user)
      if (filterUserId) {
        const actor = String(d.adminUsername || "").toUpperCase();
        const targetUserTop = d.targetUser ? String(d.targetUser).toUpperCase() : "";
        const targetUserMeta = d.metadata?.targetUser ? String(d.metadata.targetUser).toUpperCase() : "";
        
        if (actor !== filterUserId && targetUserTop !== filterUserId && targetUserMeta !== filterUserId) {
          match = false;
        }
      }

      // Date Range Filter
      if (d.timestamp) {
        const logTime = d.timestamp.toMillis ? d.timestamp.toMillis() : new Date(d.timestamp).getTime();
        if (filterStart && logTime < filterStart) match = false;
        if (filterEnd && logTime > filterEnd) match = false;
      }

      if (match) {
        logs.push({ id: doc.id, ...d });
      }
    });

    return res.status(200).json({ logs });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
