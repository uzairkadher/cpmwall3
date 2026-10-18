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
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return null;
}

function parseUserAgent(ua = "") {
  let os = "Unknown OS";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/android (\d+(\.\d+)?)/i.test(ua)) os = "Android " + (ua.match(/android (\d+(\.\d+)?)/i)?.[1] || "");
  else if (/iphone os (\d+[_\d]*)/i.test(ua)) os = "iOS " + (ua.match(/iphone os (\d+[_\d]*)/i)?.[1]?.replace(/_/g, '.') || "");
  
  let browser = "Browser";
  if (/instagram/i.test(ua)) browser = "Instagram App";
  else if (/whatsapp/i.test(ua)) browser = "WhatsApp App";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";
  
  let device = "Desktop";
  if (/mobile|android|iphone|ipad/i.test(ua)) device = "Mobile";
  if (/iphone/i.test(ua)) device = "iPhone";
  
  return { os, browser, device };
}

function getDeviceFingerprint(headers = {}) {
  const ua = headers['user-agent'] || 'unknown';
  const lang = headers['accept-language'] || 'unknown';
  const platform = headers['sec-ch-ua-platform'] || 'unknown';
  return crypto.createHash('sha256').update(`${ua}_${lang}_${platform}`).digest('hex');
}

async function containsBlockedContent(text) {
  const lower = text.toLowerCase();
  if (LINK_REGEX.test(lower)) return true;
  
  // Dynamic filter list check from settings
  let dynamicWords = [];
  try {
    const filterDoc = await db.collection("settings").doc("filters").get();
    if (filterDoc.exists && filterDoc.data().words) dynamicWords = filterDoc.data().words;
  } catch (e) {}

  const allBlocked = [...STATIC_BLOCKED_WORDS, ...dynamicWords];
  if (allBlocked.some(word => lower.includes(word))) return true;
  return false;
}

async function sendWebhookAlert(message) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🚨 **Security Alert** 🚨\n${message}` })
    });
  } catch (e) {}
}

async function askApexRacer(userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallbackReply = "I'm under the hood right now! Double-check your gear ratios and tire pressure, I'll be back soon.";
  if (!apiKey) return fallbackReply;

  try {
    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { 
          parts: [{ text: "You are an expert virtual mechanic and player named Apex Racer, specializing in Car Parking Multiplayer tuning logic (gear ratios, final drives, tire pressure). Be helpful, conversational, and keep answers under 2 sentences." }] 
        },
        contents: [{ role: "user", parts: [{ text: userMessage }] }]
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!aiRes.ok) return fallbackReply;
    const data = await aiRes.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fallbackReply;
  } catch (err) {
    return fallbackReply; // Instant fallback on 8s timeout or network error
  }
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
    
    // Enforce Uppercase Blueprint Username
    const username = String(decoded.username).toUpperCase();
    const userDoc = await db.collection("users").doc(username).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    const isRealAdmin = (username === "ADMIN");
    const isVipUser = isRealAdmin || Boolean(userData.isVip);
    const isVerifiedUser = isVipUser || Boolean(userData.isVerified);

    const { action, postId, message, room, replyTo } = req.body || {};

    // --- ADMIN ACTION HANDLERS ---
    if (action === "delete") {
      if (!isRealAdmin) return res.status(403).json({ error: "Unauthorized: Only ADMIN can delete posts." });
      if (!postId) return res.status(400).json({ error: "Missing postId" });
      const batch = db.batch();
      batch.delete(db.collection("posts").doc(postId));
      batch.delete(db.collection("ip_logs").doc(postId));
      await batch.commit();
      return res.status(200).json({ success: true });
    }

    if (action === "pin") {
      if (!isRealAdmin) return res.status(403).json({ error: "Unauthorized: Only ADMIN can pin posts." });
      const { text, name, active, isAnnouncement } = req.body || {};
      await db.collection("pinned").doc("current").set({
        text: String(text || "").substring(0, 200),
        name: String(name || "ADMIN"),
        active: Boolean(active),
        isAnnouncement: Boolean(isAnnouncement),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).json({ success: true });
    }

    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";
    const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');
    const subnet = getSubnet24(rawIp) || "N/A";
    const fingerprint = getDeviceFingerprint(req.headers);
    const isVpn = req.headers['x-vercel-ip-country'] && !req.headers['x-vercel-ip-city']; // Basic serverless VPN heuristic

    if (action === "like") {
      if (!postId) return res.status(400).json({ error: "Missing postId" });
      await db.collection("posts").doc(postId).update({ likes: admin.firestore.FieldValue.increment(1) });
      return res.status(200).json({ success: true });
    }

    if (!message) return res.status(400).json({ error: "Message required" });
    
    // Character Caps (Standard 150, VIP 250)
    const maxChars = isVipUser ? 250 : 150;
    const cleanMsg = message.trim().substring(0, maxChars);

    // --- PARALLEL SECURITY READS ---
    const [
      bannedDoc, 
      fingerprintDoc, 
      subnetBanDoc, 
      subnetWhiteDoc, 
      shadowDoc, 
      pinnedDoc, 
      rateLimitDoc,
      strikeDoc
    ] = await Promise.all([
      db.collection("banned").doc(safeIp).get(),
      db.collection("fingerprint_bans").doc(fingerprint).get(),
      subnet !== "N/A" ? db.collection("subnet_bans").doc(subnet.replace(/\*/g, '0')).get() : null,
      db.collection("subnet_whitelist").doc(safeIp).get(),
      db.collection("shadowbanned").doc(safeIp).get(),
      db.collection("pinned").doc("current").get(),
      db.collection("rate_limits").doc(safeIp).get(),
      db.collection("strikes").doc(safeIp).get()
    ]);

    // 1. Global State Checks (Raid Mode & Chat Lock)
    const pinnedData = pinnedDoc.exists ? pinnedDoc.data() : {};
    if (pinnedData.chatLocked && !isRealAdmin) {
      return res.status(403).json({ error: "Chat is currently locked by administrators." });
    }
    if (pinnedData.raidMode && !isVerifiedUser && !isVipUser && !isRealAdmin) {
      return res.status(403).json({ error: "Panic Raid Mode is active. Only VIP and Verified users can post." });
    }

    // 2. Ban Checks
    if (!isRealAdmin) {
      if (bannedDoc.exists) {
        const banData = bannedDoc.data();
        if (!banData.bannedUntil || banData.bannedUntil.toDate() > new Date()) {
          return res.status(403).json({ error: `You are banned. Reason: ${banData.reason || 'Violation'}` });
        }
      }
      if (fingerprintDoc.exists) {
        return res.status(403).json({ error: "Your device has been permanently restricted from the platform." });
      }
      if (subnetBanDoc && subnetBanDoc.exists && (!subnetWhiteDoc || !subnetWhiteDoc.exists)) {
        return res.status(403).json({ error: "Your mobile carrier network is temporarily blocked due to spam. Connect to Wi-Fi." });
      }
    }

    // 3. Dynamic Slow-Mode Enforcement
    const slowModeSeconds = pinnedData.slowModeSeconds || 10;
    if (!isRealAdmin && !isVipUser && rateLimitDoc.exists) {
      const lastPostTime = rateLimitDoc.data().lastPostAt?.toDate() || new Date(0);
      const secondsSinceLastPost = (Date.now() - lastPostTime.getTime()) / 1000;
      if (secondsSinceLastPost < slowModeSeconds) {
        return res.status(429).json({ error: `Slow mode active. Please wait ${Math.ceil(slowModeSeconds - secondsSinceLastPost)}s.` });
      }
    }

    // 4. Content Moderation & Strike Evaluation
    const isBlocked = await containsBlockedContent(cleanMsg);
    if (isBlocked && !isRealAdmin) {
      const currentStrikes = strikeDoc.exists ? strikeDoc.data().count : 0;
      const newStrikeCount = currentStrikes + 1;
      
      const batch = db.batch();
      batch.set(db.collection("strikes").doc(safeIp), {
        ip: rawIp,
        username,
        count: newStrikeCount,
        lastStrikeAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if (newStrikeCount >= 3) {
        // Issue 24-hour ban
        const bannedUntil = new Date(Date.now() + 24 * 3600 * 1000);
        batch.set(db.collection("banned").doc(safeIp), {
          ip: rawIp,
          reason: "Automated: 3 Profanity/Spam Strikes",
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          bannedUntil: admin.firestore.Timestamp.fromDate(bannedUntil)
        });
        await batch.commit();
        await sendWebhookAlert(`User **${username}** (${rawIp}) auto-banned for 24h after 3 strikes.`);
        return res.status(403).json({ error: "Account suspended for 24 hours due to repeated violations." });
      }
      
      await batch.commit();
      return res.status(400).json({ error: `Message blocked. Strike ${newStrikeCount}/3. Three strikes will result in an automated ban.` });
    }

    // 5. Build Document
    const isShadowbanned = shadowDoc.exists;
    let finalRoom = "public";
    if (room === "vip" && (isVipUser || isRealAdmin)) finalRoom = "vip";
    else if (room === "market") finalRoom = "market";

    const batch = db.batch();
    const postRef = db.collection("posts").doc();
    
    // Post Data
    batch.set(postRef, {
      name: username,
      userId: username,
      message: cleanMsg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isVerified: isVerifiedUser,
      isVip: isVipUser,
      isAdmin: isRealAdmin,
      isShadowbanned,
      likes: 0,
      room: finalRoom,
      replyTo: replyTo || null
    });

    // Parallel Telemetry: IP Logs (Accessible only to admins)
    const uaMeta = parseUserAgent(req.headers['user-agent']);
    batch.set(db.collection("ip_logs").doc(postRef.id), {
      postId: postRef.id,
      ip: rawIp,
      name: username,
      message: cleanMsg,
      country: req.headers['x-vercel-ip-country'] || 'Unknown',
      city: req.headers['x-vercel-ip-city'] || 'Unknown',
      device: uaMeta.device,
      os: uaMeta.os,
      browser: uaMeta.browser,
      subnet,
      fingerprint,
      isVpn,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update Rate Limit
    if (!isRealAdmin) {
      batch.set(db.collection("rate_limits").doc(safeIp), {
        lastPostAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();

    // 6. AI Integration: Apex Racer
    if (cleanMsg.includes("@Apex_Racer")) {
      const aiReply = await askApexRacer(cleanMsg);
      const botPostRef = db.collection("posts").doc();
      await botPostRef.set({
        name: "Apex_Racer",
        userId: "BOT",
        message: aiReply,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isVerified: true,
        isBot: true,
        isVip: false,
        isAdmin: false,
        likes: 0,
        room: finalRoom,
        replyTo: { name: username, text: cleanMsg }
      });
    }

    return res.status(200).json({ success: true, isShadowbanned });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
