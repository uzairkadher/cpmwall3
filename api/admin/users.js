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
    // 1. JWT & Role Authorization (NO x-admin-key used)
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

    // --- GET: List Users (Pagination, Search, Role Filter) ---
    if (req.method === "GET") {
      const q = (req.query.q || "").toUpperCase();
      const roleFilter = req.query.role ? String(req.query.role).toUpperCase() : null;
      const limitVal = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const page = Math.max(1, Number(req.query.page) || 1);

      // Fetch base pool (Ordered by creation if available, or just fetch pool)
      let queryRef = db.collection("users").limit(300); // Fetch a reasonable pool for memory filtering
      const snapshot = await queryRef.get();
      
      let results = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        let match = true;
        
        if (q && !data.username?.toUpperCase().includes(q)) match = false;
        if (roleFilter && data.role !== roleFilter) match = false;
        
        if (match) {
          // Strip sensitive auth data before returning
          const safeData = { ...data };
          delete safeData.passHash;
          delete safeData.passwordHash;
          results.push(safeData);
        }
      });

      // Simple array pagination
      const totalResults = results.length;
      const startIndex = (page - 1) * limitVal;
      const paginatedResults = results.slice(startIndex, startIndex + limitVal);

      return res.status(200).json({
        users: paginatedResults,
        total: totalResults,
        page,
        totalPages: Math.ceil(totalResults / limitVal)
      });
    }

    // --- POST: Update Role / Ban User ---
    if (req.method === "POST") {
      const { action, targetUsername, role, reason, hours, banIp } = req.body || {};
      const cleanTarget = String(targetUsername || "").toUpperCase().trim();

      if (!cleanTarget) return res.status(400).json({ error: "Target username required" });
      if (cleanTarget === adminUsername) return res.status(400).json({ error: "Cannot modify own account" });
      
      const targetRef = db.collection("users").doc(cleanTarget);
      const targetDoc = await targetRef.get();
      
      if (!targetDoc.exists) return res.status(404).json({ error: "Target user not found" });
      const targetData = targetDoc.data();

      // Action: Update Role
      if (action === "update_role") {
        if (!role) return res.status(400).json({ error: "Role value required" });
        const allowed = ["ADMIN","VIP","USER","MOD"];
        const cleanRole = String(role).toUpperCase();
        if (!allowed.includes(cleanRole)) return res.status(400).json({ error: "Invalid role" });
        
        await targetRef.update({ role: cleanRole });
        
        await db.collection("audit_logs").add({
          adminUsername,
          action: "UPDATE_USER_ROLE",
          method: "POST",
          ip: rawIp,
          targetUser: cleanTarget,
          metadata: { newRole: cleanRole },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({ success: true, target: cleanTarget, role: cleanRole });
      }

      // Action: Ban User
      if (action === "ban") {
        const batch = db.batch();
        let bannedUntil = null;
        if (hours && Number(hours) > 0) {
          bannedUntil = admin.firestore.Timestamp.fromMillis(Date.now() + Number(hours) * 3600 * 1000);
        }

        // Update user document
        batch.update(targetRef, { 
          isBanned: true,
          bannedReason: reason || "Administrative Ban"
        });

        // Add to ban ledger (if IP is provided or available on user doc)
        const ipToBan = banIp || targetData.ip;
        if (ipToBan && ipToBan !== "unknown") {
          const safeIp = ipToBan.replace(/[^a-zA-Z0-9.:]/g, "_");
          batch.set(db.collection("banned").doc(safeIp), {
            ip: ipToBan,
            username: cleanTarget,
            reason: reason || "Administrative Action",
            bannedAt: admin.firestore.FieldValue.serverTimestamp(),
            bannedUntil
          });
        }

        await batch.commit();

        await db.collection("audit_logs").add({
          adminUsername,
          action: "BAN_USER",
          method: "POST",
          ip: rawIp,
          targetUser: cleanTarget,
          metadata: { reason: reason || "None", hours: hours || "Permanent" },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, target: cleanTarget, isBanned: true });
      }

      return res.status(400).json({ error: "Invalid action" });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
