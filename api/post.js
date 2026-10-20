import crypto from "crypto";
import admin from "firebase-admin";
import { isSessionActive, verifyJwt } from "./auth.js";

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

const MAX_STANDARD_CHARS = 150;
const MAX_VIP_CHARS = 250;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const LINK_REGEX =
  /(https?:\/\/|www\.|discord\.gg|t\.me|telegram\.me|chat\.whatsapp\.com|\.com|\.gg|\.xyz|\.top)/i;
const STATIC_BLOCKED_WORDS = [
  "free coins", "hack cpm", "mod apk", "cpm hack",
  "coin generator", "buy followers", "free w16",
  "cpm unlimited", "bit.ly", "tinyurl",
  "chutiya", "madarchod", "gandu", "bhenchod",
  "harami", "bitch", "nigger", "faggot", "scam"
];

function getDb() {
  if (!process.env.FIREBASE_SERVICE_KEY) {
    throw new Error("Firebase service configuration is missing.");
  }
  if (!admin.apps.length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
    } catch {
      throw new Error("Firebase service configuration is invalid.");
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  return admin.firestore();
}

function getSubnet24(ip = "") {
  const parts = ip.split(".");
  if (
    parts.length === 4 &&
    parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  ) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  return null;
}

function getClientIp(req) {
  // Use Vercel's trusted request metadata, not an arbitrary
  // client-supplied forwarding header.
  const candidate =
    req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "";
  const ip = String(candidate).split(",")[0].trim();
  if (
    ip.length > 64 ||
    !/^[a-fA-F0-9:.]+$/.test(ip) ||
    ip === "unknown"
  ) {
    return "unknown";
  }
  return ip;
}

function getSafeIpKey(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function getDeviceFingerprint(headers = {}) {
  const ua = String(headers["user-agent"] || "unknown").slice(0, 512);
  const lang = String(headers["accept-language"] || "unknown").slice(0, 128);
  const platform = String(headers["sec-ch-ua-platform"] || "unknown").slice(0, 128);
  return crypto
    .createHash("sha256")
    .update(`${ua}_${lang}_${platform}`)
    .digest("hex");
}

function parseUserAgent(ua = "") {
  let os = "Unknown OS";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad/i.test(ua)) os = "iOS";

  let browser = "Browser";
  if (/instagram/i.test(ua)) browser = "Instagram App";
  else if (/whatsapp/i.test(ua)) browser = "WhatsApp App";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";

  let device = /mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Desktop";
  if (/iphone/i.test(ua)) device = "iPhone";

  return { os, browser, device };
}

async function containsBlockedContent(db, text) {
  if (LINK_REGEX.test(text)) return true;
  try {
    const filterDoc = await db.collection("settings").doc("filters").get();
    const configuredWords = filterDoc.exists
      ? filterDoc.data()?.words
      : [];
    const dynamicWords = Array.isArray(configuredWords)
      ? configuredWords.filter(
          word => typeof word === "string" && word.length > 0
        )
      : [];
    const lower = text.toLowerCase();
    return [...STATIC_BLOCKED_WORDS, ...dynamicWords].some(
      word => lower.includes(word.toLowerCase())
    );
  } catch {
    // Do not silently bypass moderation if its configuration cannot
    // be read.
    throw new Error("Moderation service is temporarily unavailable.");
  }
}

async function sendWebhookAlert(message) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `Security alert: ${message}` }),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    // Alert delivery failure must not expose server details.
  }
}

async function askApexRacer(userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallbackReply =
    "I'm under the hood right now! Double-check your gear ratios and tire pressure, I'll be back soon.";
  if (!apiKey) return fallbackReply;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text:
                "You are Apex Racer, an expert Car Parking Multiplayer tuning assistant. Be helpful and keep answers under two sentences."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: userMessage.slice(0, 1000) }]
          }]
        }),
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!response.ok) return fallbackReply;
    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      fallbackReply
    ).slice(0, 1500);
  } catch {
    return fallbackReply;
  }
}

function validDocumentId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1500 &&
    !value.includes("/")
  );
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    // Dynamically echo the valid requested origin back to the client
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
      return res.status(403).end();
    }
    // Explicitly answer preflight requests with a 200 OK
    return res.status(200).end();
  }
  
  if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let db;
  try {
    db = getDb();
  } catch {
    return res.status(500).json({ error: "Server configuration error." });
  }

  // Public post feed. Do not expose internal moderation or IP logs.
  if (req.method === "GET") {
    try {
      let viewer = null;
      const authorization = req.headers.authorization || "";
      const tokenMatch = authorization.match(/^Bearer\s+(\S+)$/);
      if (tokenMatch) {
        try {
          const decoded = verifyJwt(tokenMatch[1]);
          if (
            decoded &&
            typeof decoded.username === "string" &&
            await isSessionActive(db, decoded)
          ) {
            viewer = decoded.username;
          }
        } catch {}
      }

      const snap = await db
        .collection("posts")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      const posts = snap.docs
        .filter(doc => {
          const data = doc.data();
          return (
            data.isShadowbanned !== true ||
            (viewer && (data.userId === viewer || data.name === viewer))
          );
        })
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "Unknown",
            userId: data.userId || data.name || "Unknown",
            message: data.message || "",
            createdAt: data.createdAt || null,
            isVerified: Boolean(data.isVerified),
            isVip: Boolean(data.isVip),
            isAdmin: Boolean(data.isAdmin),
            isBot: Boolean(data.isBot),
            likes: Number.isSafeInteger(data.likes) ? data.likes : 0,
            room: data.room || "public",
            replyTo: data.replyTo || null
          };
        });

      return res.status(200).json(posts);
    } catch {
      return res.status(500).json({ error: "Could not load posts." });
    }
  }

  try {
    const authorization = req.headers.authorization || "";
    const tokenMatch = authorization.match(/^Bearer\s+(\S+)$/);

    if (!tokenMatch) {
      return res.status(401).json({ error: "Authentication required." });
    }

    let decoded;
    try {
      decoded = verifyJwt(tokenMatch[1]);
    } catch {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    if (!decoded) {
      return res.status(401).json({ error: "Invalid session." });
    }
    if (!(await isSessionActive(db, decoded))) {
      return res.status(401).json({ error: "Session revoked." });
    }

    const username =
      typeof decoded.username === "string"
        ? decoded.username.toUpperCase()
        : "";

    if (!/^[A-Z0-9_.]{3,20}$/.test(username)) {
      return res.status(401).json({ error: "Invalid session." });
    }

    const userRef = db.collection("users").doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(401).json({ error: "Account not found." });
    }

    const userData = userSnap.data() || {};
    const isRealAdmin = userData.role === "ADMIN";
    if (!isRealAdmin && userData.isBanned) {
      const until = userData.bannedUntil?.toDate?.();
      if (!until || until > new Date()) {
        return res.status(403).json({
          error: "Your account is banned from posting."
        });
      }
    }
    const isVipUser =
      isRealAdmin &&
      true ||
      Boolean(userData.isVip);
    const isVerifiedUser = isVipUser || Boolean(userData.isVerified);

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};

    const { action, postId, message, room, replyTo } = body;

    // Administrative actions require the role stored in Firestore.
    // The username "ADMIN" alone does not grant privileges.
    if (action === "delete") {
      if (!isRealAdmin) {
        return res.status(403).json({ error: "Admin permission required." });
      }
      if (!validDocumentId(postId)) {
        return res.status(400).json({ error: "Invalid post ID." });
      }

      const batch = db.batch();
      batch.delete(db.collection("posts").doc(postId));
      batch.delete(db.collection("ip_logs").doc(postId));
      await batch.commit();

      return res.status(200).json({ success: true });
    }

    if (action === "pin") {
      if (!isRealAdmin) {
        return res.status(403).json({ error: "Admin permission required." });
      }
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length > 200) {
        return res.status(400).json({ error: "Pinned text is too long." });
      }

      await db.collection("pinned").doc("current").set({
        text,
        name: username,
        active: body.active === true,
        isAnnouncement: body.isAnnouncement === true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return res.status(200).json({ success: true });
    }

    const rawIp = getClientIp(req);
    const ipKey = getSafeIpKey(rawIp);
    const subnet = getSubnet24(rawIp);
    const fingerprint = getDeviceFingerprint(req.headers);

    if (action === "like") {
      if (!validDocumentId(postId)) {
        return res.status(400).json({ error: "Invalid post ID." });
      }
      const postRef = db.collection("posts").doc(postId);
      // The original increment endpoint allowed unlimited repeat likes.
      // Use a per-user marker to prevent repeated likes from this account.
      const likeRef = postRef.collection("likes").doc(username);

      try {
        await db.runTransaction(async transaction => {
          const postSnap = await transaction.get(postRef);
          const likeSnap = await transaction.get(likeRef);

          if (!postSnap.exists) {
            const error = new Error("POST_NOT_FOUND");
            throw error;
          }
          if (likeSnap.exists) {
            const error = new Error("ALREADY_LIKED");
            throw error;
          }

          transaction.create(likeRef, {
            username,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          transaction.update(postRef, {
            likes: admin.firestore.FieldValue.increment(1)
          });
        });
      } catch (error) {
        if (error.message === "POST_NOT_FOUND") {
          return res.status(404).json({ error: "Post not found." });
        }
        if (error.message === "ALREADY_LIKED") {
          return res.status(409).json({ error: "You already liked this post." });
        }
        throw error;
      }
      return res.status(200).json({ success: true });
    }

    if (action && action !== "post") {
      return res.status(400).json({ error: "Unknown action." });
    }

    if (typeof message !== "string") {
      return res.status(400).json({ error: "Message required." });
    }

    const cleanMsg = message.trim();
    if (!cleanMsg) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    const maxChars = isVipUser ? MAX_VIP_CHARS : MAX_STANDARD_CHARS;
    if (cleanMsg.length > maxChars) {
      return res.status(400).json({
        error: `Message exceeds the ${maxChars}-character limit.`
      });
    }

    const pinnedRef = db.collection("pinned").doc("current");
    const [
      banSnap,
      fingerprintBanSnap,
      subnetBanSnap,
      whitelistSnap,
      shadowSnap,
      pinnedSnap
    ] = await Promise.all([
      db.collection("banned").doc(ipKey).get(),
      db.collection("fingerprint_bans").doc(fingerprint).get(),
      subnet
        ? db.collection("subnet_bans").doc(subnet).get()
        : Promise.resolve(null),
      db.collection("subnet_whitelist").doc(ipKey).get(),
      db.collection("shadowbanned").doc(ipKey).get(),
      pinnedRef.get()
    ]);

    const pinnedData = pinnedSnap.exists ? pinnedSnap.data() : {};

    if (pinnedData.chatLocked && !isRealAdmin) {
      return res.status(403).json({ error: "Chat is locked." });
    }
    if (pinnedData.raidMode && !isVerifiedUser && !isRealAdmin) {
      return res.status(403).json({
        error: "Only verified and VIP users can post during raid mode."
      });
    }

    if (!isRealAdmin) {
      if (banSnap.exists) {
        const banData = banSnap.data();
        const until = banData.bannedUntil?.toDate?.();
        if (!until || until > new Date()) {
          return res.status(403).json({
            error: "Posting is restricted for this network."
          });
        }
      }
      if (fingerprintBanSnap.exists) {
        return res.status(403).json({
          error: "This device is restricted from posting."
        });
      }
      if (
        subnetBanSnap?.exists &&
        !whitelistSnap.exists
      ) {
        return res.status(403).json({
          error: "Posting is restricted on this network."
        });
      }
    }

    let isBlocked;
    try {
      isBlocked = await containsBlockedContent(db, cleanMsg);
    } catch {
      return res.status(503).json({
        error: "Moderation is temporarily unavailable. Please retry."
      });
    }

    if (isBlocked && !isRealAdmin) {
      const strikeRef = db.collection("strikes").doc(ipKey);
      let strikeCount = 0;

      await db.runTransaction(async transaction => {
        const snap = await transaction.get(strikeRef);
        strikeCount = (snap.exists ? Number(snap.data().count) || 0 : 0) + 1;

        transaction.set(strikeRef, {
          ip: rawIp,
          username,
          count: strikeCount,
          lastStrikeAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (strikeCount >= 3) {
          transaction.set(db.collection("banned").doc(ipKey), {
            ip: rawIp,
            reason: "Automated spam/content violations",
            bannedAt: admin.firestore.FieldValue.serverTimestamp(),
            bannedUntil: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 24 * 60 * 60 * 1000)
            )
          });
        }
      });

      if (strikeCount >= 3) {
        await sendWebhookAlert(
          `Account ${username} was restricted after repeated content violations.`
        );
        return res.status(403).json({
          error: "Posting suspended after repeated content violations."
        });
      }

      return res.status(400).json({
        error: `Message blocked. Strike ${strikeCount}/3.`
      });
    }

    const finalRoom =
      room === "vip" && isVipUser
        ? "vip"
        : room === "market"
          ? "market"
          : "public";

    const postRef = db.collection("posts").doc();
    const ipLogRef = db.collection("ip_logs").doc(postRef.id);
    const rateRef = db.collection("rate_limits").doc(ipKey);

    const userAgent = parseUserAgent(
      String(req.headers["user-agent"] || "")
    );

    // Atomically check and increment the persistent Firestore rate limit.
    // This prevents concurrent requests from bypassing the five-post cap.
    await db.runTransaction(async transaction => {
      const rateSnap = await transaction.get(rateRef);
      const now = Date.now();
      const data = rateSnap.exists ? rateSnap.data() : {};
      const windowStart = data.windowStart?.toMillis?.() || 0;
      const inWindow = now - windowStart < RATE_WINDOW_MS;
      const count = inWindow ? Number(data.count) || 0 : 0;
      const slowModeSeconds = Math.max(
        0,
        Math.min(300, Number(pinnedData.slowModeSeconds) || 10)
      );
      const lastPostAt = data.lastPostAt?.toMillis?.() || 0;

      if (!isRealAdmin && count >= RATE_LIMIT) {
        const error = new Error("RATE_LIMIT");
        error.retryAfter = Math.max(
          1,
          Math.ceil((RATE_WINDOW_MS - (now - windowStart)) / 1000)
        );
        throw error;
      }

      if (
        !isRealAdmin &&
        !isVipUser &&
        lastPostAt &&
        now - lastPostAt < slowModeSeconds * 1000
      ) {
        const error = new Error("SLOW_MODE");
        error.retryAfter = Math.ceil(
          (slowModeSeconds * 1000 - (now - lastPostAt)) / 1000
        );
        throw error;
      }

      transaction.set(postRef, {
        name: username,
        userId: username,
        message: cleanMsg,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isVerified: isVerifiedUser,
        isVip: isVipUser,
        isAdmin: isRealAdmin,
        isShadowbanned: shadowSnap.exists,
        likes: 0,
        room: finalRoom,
        replyTo: replyTo && typeof replyTo === "object"
          ? {
              name: String(replyTo.name || "").slice(0, 20),
              text: String(replyTo.text || "").slice(0, 250)
            }
          : null
      });

      transaction.set(ipLogRef, {
        postId: postRef.id,
        ip: rawIp,
        name: username,
        message: cleanMsg,
        country: String(req.headers["x-vercel-ip-country"] || "Unknown").slice(0, 100),
        city: String(req.headers["x-vercel-ip-city"] || "Unknown").slice(0, 100),
        device: userAgent.device,
        os: userAgent.os,
        browser: userAgent.browser,
        subnet: subnet || "N/A",
        fingerprint,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!isRealAdmin) {
        transaction.set(rateRef, {
          count: count + 1,
          windowStart: admin.firestore.Timestamp.fromMillis(
            inWindow ? windowStart : now
          ),
          lastPostAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    });

    if (cleanMsg.includes("@Apex_Racer")) {
      const aiReply = await askApexRacer(cleanMsg);
      await db.collection("posts").add({
        name: "Apex_Racer",
        userId: "BOT",
        message: aiReply,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isVerified: true,
        isBot: true,
        isVip: false,
        isAdmin: false,
        isShadowbanned: false,
        likes: 0,
        room: finalRoom,
        replyTo: { name: username, text: cleanMsg }
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    if (error.message === "RATE_LIMIT" || error.message === "SLOW_MODE") {
      const retryAfter = Math.max(1, Number(error.retryAfter) || 1);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error:
          error.message === "RATE_LIMIT"
            ? `Rate limit exceeded. Please wait ${retryAfter} seconds.`
            : `Slow mode active. Please wait ${retryAfter} seconds.`
      });
    }

    console.error("Post API failure:", error.message || "Unknown error");
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}