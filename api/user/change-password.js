import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Unauthorized: Missing token" });

    const decoded = verifyJwt(token);
    if (!decoded || !decoded.username) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    const username = decoded.username;
    const userRef = db.collection("users").doc(username);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data();

    if (req.method === "GET") {
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
    }

    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || typeof oldPassword !== "string" || !newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ error: "New password must be different from your current password" });
    }

    let isOldPasswordValid = false;
    if (userData.passwordHash) {
      isOldPasswordValid = await bcrypt.compare(oldPassword, userData.passwordHash);
    } else if (userData.passHash) {
      const legacyShaHash = crypto
        .createHash("sha256")
        .update(oldPassword + "cpm_salt_2025")
        .digest("hex");
      isOldPasswordValid = (legacyShaHash === userData.passHash);
    }

    if (!isOldPasswordValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await userRef.update({
      passwordHash: newPasswordHash,
      passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
