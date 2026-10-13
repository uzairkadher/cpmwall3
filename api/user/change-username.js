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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Unauthorized: Missing token" });

    const decoded = verifyJwt(token);
    if (!decoded || !decoded.username) return res.status(401).json({ error: "Unauthorized: Invalid token" });

    const oldUsername = decoded.username;
    const { newUsername } = req.body || {};
    const cleanNew = String(newUsername || "").toLowerCase().trim();

    if (!/^[a-z0-9_.]{3,20}$/.test(cleanNew)) {
      return res.status(400).json({ error: "Invalid username format (3-20 chars: a-z, 0-9, _, .)" });
    }

    if (cleanNew === oldUsername) {
      return res.status(400).json({ error: "New username is the same as current username" });
    }

    const userRef = db.collection("users").doc(oldUsername);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });

    const userData = userSnap.data();

    if (userData.lastUsernameChange) {
      const lastChange = userData.lastUsernameChange.toDate ? userData.lastUsernameChange.toDate() : new Date(userData.lastUsernameChange);
      const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 3600 * 24);
      if (daysSince < 30) {
        const remaining = Math.ceil(30 - daysSince);
        return res.status(403).json({ error: `Username change locked. Please wait ${remaining} more days.` });
      }
    }

    const targetSnap = await db.collection("users").doc(cleanNew).get();
    if (targetSnap.exists) {
      return res.status(400).json({ error: "Username is already taken" });
    }

    const newUserData = { ...userData, username: cleanNew, lastUsernameChange: admin.firestore.FieldValue.serverTimestamp() };
    delete newUserData.username; // Firestore document ID acts as username or store inside

    const batch = db.batch();
    batch.set(db.collection("users").doc(cleanNew), { ...userData, username: cleanNew, lastUsernameChange: admin.firestore.FieldValue.serverTimestamp() });
    batch.delete(userRef);

    const postsSnap = await db.collection("posts").where("name", "==", oldUsername).get();
    postsSnap.forEach(doc => {
      batch.update(doc.ref, { name: cleanNew });
    });

    const ipLogsSnap = await db.collection("ip_logs").where("name", "==", oldUsername).get();
    ipLogsSnap.forEach(doc => {
      batch.update(doc.ref, { name: cleanNew });
    });

    await batch.commit();

    return res.status(200).json({ success: true, newUsername: cleanNew });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}