import crypto from "crypto";
import admin from "firebase-admin";
import { verifyJwt } from "./auth.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY))
  });
}
const db = admin.firestore();

const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg|t\.me|telegram\.me|chat\.whatsapp\.com|\.com|\.gg|\.xyz|\.top)/i;
const STATIC_BLOCKED_WORDS = [
  "free coins", "hack cpm", "mod apk", "cpm hack", "coin generator",
  "buy followers", "free w16", "cpm unlimited", "bit.ly", "tinyurl",
  "chutiya", "madarchod", "gandu", "bhenchod", "harami", "bitch",
  "nigger", "faggot", "scam"
];

function getSubnet24(ip = "") {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return null;
}

function getDeviceFingerprint(client = {}, ua = "") {
  const screen = client.screen || "0x0";
  const cores = client.cores || "0";
  const ram = client.ram || "0";
  const dev = client.device || "generic";
  const os = client.os || "os";
  return `${screen}_${cores}_${ram}_${dev}_${os}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function containsBlockedContent(text) {
  const lower = text.toLowerCase();
  if (LINK_REGEX.test(lower)) return true;
  if (STATIC_BLOCKED_WORDS.some(word => lower.includes(word))) return true;
  return false;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const snap = await db.collection("posts").orderBy("createdAt", "desc").limit(100).get();
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json(posts);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Unauthorized: Missing authentication token" });

    const decoded = verifyJwt(token);
    if (!decoded || !decoded.username) return res.status(401).json({ error: "Unauthorized: Invalid token" });

    const username = decoded.username;
    const userDoc = await db.collection("users").doc(username).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const isVipUser = Boolean(userData.isVip);
    const isRealAdmin = (username === "jagga");

    const { action, postId, message, room, replyTo } = req.body || {};
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";
    const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');

    if (action === "like") {
      if (!postId) return res.status(400).json({ error: "Missing postId" });
      await db.collection("posts").doc(postId).update({ likes: admin.firestore.FieldValue.increment(1) });
      return res.status(200).json({ success: true });
    }

    if (!message) return res.status(400).json({ error: "Message required" });
    const maxChars = isVipUser ? 250 : 150;
    const cleanMsg = message.trim().substring(0, maxChars);

    const isBlocked = await containsBlockedContent(cleanMsg);
    if (isBlocked && !isRealAdmin) {
      return res.status(400).json({ error: "Message blocked due to prohibited content." });
    }

    let finalRoom = "public";
    if (room === "vip" && (isVipUser || isRealAdmin)) finalRoom = "vip";
    else if (room === "market") finalRoom = "market";

    const batch = db.batch();
    const postRef = db.collection("posts").doc();

    batch.set(postRef, {
      name: username,
      userId: username,
      message: cleanMsg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isVerified: true,
      isVip: isVipUser,
      isAdmin: isRealAdmin,
      likes: 0,
      room: finalRoom,
      replyTo: replyTo || null
    });

    await batch.commit();
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}