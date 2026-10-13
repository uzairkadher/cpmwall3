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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Unauthorized: Missing token" });

    const decoded = verifyJwt(token);
    if (!decoded || !decoded.username) return res.status(401).json({ error: "Unauthorized: Invalid token" });

    const username = decoded.username;
    const userRef = db.collection("users").doc(username);
    const userDoc = await userRef.get();

    if (req.method === "POST") {
      const { photoURL } = req.body || {};
      if (photoURL !== undefined) {
        await userRef.set({ photoURL }, { merge: true });
        return res.status(200).json({ success: true, photoURL });
      }
    }

    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data();
    const isAdmin = (userData.username === "jagga" || username === "jagga");
    const isVip = isAdmin || Boolean(userData.isVip);

    return res.status(200).json({
      username: userData.username,
      isAdmin: isAdmin,
      isVip: isVip,
      photoURL: userData.photoURL || "",
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