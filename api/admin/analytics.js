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

    // --- GET: Fetch Analytics ---
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);

    // Fetch aggregate counts and recent posts concurrently for optimal performance
    const [totalUsersSnap, totalPostsSnap, activeTodaySnap, postsTodaySnap, recentPostsSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("posts").count().get(),
      db.collection("visitors").where("lastSeen", ">=", startTimestamp).count().get(),
      db.collection("posts").where("createdAt", ">=", startTimestamp).count().get(),
      db.collection("posts").where("createdAt", ">=", startTimestamp).get() // Needed for topPosters calculation
    ]);

    const totalUsers = totalUsersSnap.data().count;
    const totalPosts = totalPostsSnap.data().count;
    const activeToday = activeTodaySnap.data().count;
    const postsToday = postsTodaySnap.data().count;

    // Calculate Top Posters from today's activity in-memory
    const userPostCounts = {};
    recentPostsSnap.forEach(doc => {
      const data = doc.data();
      const uname = data.name || data.userId || "Unknown";
      userPostCounts[uname] = (userPostCounts[uname] || 0) + 1;
    });

    const topPosters = Object.entries(userPostCounts)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Return top 10

    return res.status(200).json({
      totalUsers,
      activeToday,
      totalPosts,
      postsToday,
      topPosters
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
