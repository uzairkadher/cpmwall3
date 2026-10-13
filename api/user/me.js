import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY))
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Unauthorized: Missing token" });

    const decoded = verifyJwt(token);
    if (!decoded || !decoded.username) return res.status(401).json({ error: "Unauthorized: Invalid token" });

    const username = decoded.username;
    const userDoc = await db.collection("users").doc(username).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data();
    return res.status(200).json({
      username: userData.username,
      isAdmin: userData.username === "jagga",
      isVip: Boolean(userData.isVip),
      vipExpiresAt: userData.vipExpiresAt || null,
      customColor: userData.customColor || "#f59e0b",
      customFrame: userData.customFrame || "gold",
      chatBg: userData.chatBg || "",
      lastUsernameChange: userData.lastUsernameChange || null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}