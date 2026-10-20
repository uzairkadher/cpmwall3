import admin from "firebase-admin";
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
const TOP_POSTS_SAMPLE_LIMIT = 1000;

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

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
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

    // Check the current role in Firestore rather than trusting JWT role claims.
    const adminDoc = await db.collection("users").doc(adminUsername).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Use the server's local calendar day, matching the original endpoint's
    // date-boundary behavior. Change this deliberately if UTC is required.
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);

    const usersCollection = db.collection("users");
    const postsCollection = db.collection("posts");
    const visitorsCollection = db.collection("visitors");

    const [
      totalUsersSnapshot,
      totalPostsSnapshot,
      activeTodaySnapshot,
      postsTodaySnapshot,
      recentPostsSnapshot,
    ] = await Promise.all([
      usersCollection.count().get(),
      postsCollection.count().get(),
      visitorsCollection
        .where("lastSeen", ">=", startTimestamp)
        .count()
        .get(),
      postsCollection
        .where("createdAt", ">=", startTimestamp)
        .count()
        .get(),
      postsCollection
        .where("createdAt", ">=", startTimestamp)
        .orderBy("createdAt", "desc")
        .limit(TOP_POSTS_SAMPLE_LIMIT)
        .get(),
    ]);

    const userPostCounts = Object.create(null);

    recentPostsSnapshot.forEach((doc) => {
      const data = doc.data();
      const rawUsername = data.name || data.userId || "Unknown";
      const username =
        typeof rawUsername === "string"
          ? rawUsername.slice(0, 80)
          : "Unknown";

      userPostCounts[username] = (userPostCounts[username] || 0) + 1;
    });

    const topPosters = Object.entries(userPostCounts)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count || a.username.localeCompare(b.username))
      .slice(0, 10);

    return res.status(200).json({
      totalUsers: totalUsersSnapshot.data().count,
      activeToday: activeTodaySnapshot.data().count,
      totalPosts: totalPostsSnapshot.data().count,
      postsToday: postsTodaySnapshot.data().count,
      topPosters,
      topPostersSampled: postsTodaySnapshot.data().count >
        TOP_POSTS_SAMPLE_LIMIT,
    });

  } catch (err) {
    // Log the internal error on the server; never return its details to clients.
    console.error("Admin analytics request failed:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
