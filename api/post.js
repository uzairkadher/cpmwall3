import admin from "firebase-admin";

let serviceAccount = null;
if (!admin.apps.length) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY || "{}");
}
const db = admin.firestore();

const RESERVED = ["admin", "apex_racer", "system", "moderator", "cpm_bot"];
const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg|t\.me|telegram\.me|chat\.whatsapp\.com|\.com|\.gg|\.xyz|\.top)/i;
const ALLOWED_COLORS = ["#ef4444", "#f59e0b", "#a855f7", "#22c55e", "#00f0ff"];

const STATIC_BLOCKED_WORDS = [
  "free coins", "hack cpm", "mod apk", "cpm hack", "coin generator",
  "buy followers", "free w16", "cpm unlimited", "bit.ly", "tinyurl",
  "chutiya", "madarchod", "gandu", "bhenchod", "harami", "bitch",
  "nigger", "faggot", "scam"
];

async function containsBlockedContent(text) {
  const lower = text.toLowerCase();
  if (LINK_REGEX.test(lower)) return true;
  if (STATIC_BLOCKED_WORDS.some(word => lower.includes(word))) return true;

  try {
    const filterDoc = await db.collection("settings").doc("filters").get();
    if (filterDoc.exists) {
      const customWords = filterDoc.data().words || [];
      if (customWords.some(w => lower.includes(w.toLowerCase()))) return true;
    }
  } catch {}

  return false;
}

function parseUserAgent(ua = "") {
  let os = "Unknown OS";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/android (\d+(\.\d+)?)/i.test(ua)) os = "Android " + (ua.match(/android (\d+(\.\d+)?)/i)?.[1] || "");
  else if (/iphone os (\d+[_\d]*)/i.test(ua)) os = "iOS " + (ua.match(/iphone os (\d+[_\d]*)/i)?.[1]?.replace(/_/g, '.') || "");
  else if (/mac os x/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/instagram/i.test(ua)) browser = "Instagram App";
  else if (/whatsapp/i.test(ua)) browser = "WhatsApp App";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";
  else if (/firefox\//i.test(ua)) browser = "Firefox";

  let device = "Desktop";
  if (/mobile|android|iphone|ipad/i.test(ua)) {
    device = "Mobile";
    const model = ua.match(/;\s*([^;)]+)\s*Build\//i);
    if (model && model[1]) device = model[1].trim();
    else if (/iphone/i.test(ua)) device = "iPhone";
    else if (/ipad/i.test(ua)) device = "iPad";
  }

  return { os, browser, device };
}

function checkVpnIndicators(req) {
  const headers = req.headers || {};
  const cfConnectingIp = headers["cf-connecting-ip"];
  const xForwardedFor = headers["x-forwarded-for"];
  const proxyHeaders = ["x-real-ip", "via", "forwarded", "x-cluster-client-ip"];
  const hasMultipleIps = xForwardedFor && xForwardedFor.includes(",");
  const hasProxyHeader = proxyHeaders.some(h => Boolean(headers[h]));
  return Boolean(hasMultipleIps || hasProxyHeader || headers["cf-ray"]?.includes("TOR"));
}

function getHumanFallback(cleanMsg) {
  const t = cleanMsg.toLowerCase();

  if (t.includes("who are you") || t.includes("what are you") || t.includes("are you a bot") || t.includes("are you bot")) {
    const replies = [
      "I'm Apex bro, just a CPM racer hanging out in the lobby.",
      "Just a regular player tuning cars and testing drag setups.",
      "A CPM driver who spends way too much time in the garage haha."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("why are you best") || t.includes("best") || t.includes("fastest") || t.includes("pro")) {
    const replies = [
      "Because my gearbox ratios on the 400m strip do not miss bro.",
      "Not the best, just got hundreds of dyno hours on the drag strip.",
      "Lots of practice and testing AWD launch tunes bro, nothing crazy."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t === "hi" || t === "hello" || t === "hey" || t.includes("what's up") || t.includes("whats up") || t === "yo") {
    const replies = [
      "Yo what's up bro! You running drag or cruising today?",
      "Sup man! Ready to jump into the lobby whenever.",
      "Hey bro, good to see you. What car you driving right now?"
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("how are you") || t.includes("how r u")) {
    const replies = [
      "Chilling bro, just dialing in a new drift angle setup. How about you?",
      "Doing good man, just testing launch control on the strip.",
      "Pretty good bro, looking for clean rooms to join."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("supra") || t.includes("gearbox") || t.includes("gear") || t.includes("ratio")) {
    const replies = [
      "For Supra set Final Drive 3.12, 1st 2.66, 2nd 1.90. Fast shifts and no wheel spin.",
      "Run Final Drive 2.80 with AWD on Supra, easy sub-6 second run on the strip.",
      "Keep 1st gear long around 2.70 so you don't burn rubber off the starting line."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("drag") || t.includes("speed") || t.includes("fast") || t.includes("launch")) {
    const replies = [
      "Drop your tire pressure to 1.2 bar and launch in 2nd gear bro.",
      "Turn off TCS and ESP before staging at the line, thank me later.",
      "Max out torque, switch to AWD, and shift right as the needle touches red."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("drift")) {
    const replies = [
      "RWD mode, steer angle at 60, zero front camber, and stiff rear suspension.",
      "Lock steering angle to 58 and tap the handbrake into the corners."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("trade") || t.includes("sell") || t.includes("buy")) {
    const replies = [
      "What you got to trade bro? Any clean custom liveries or W16 builds?",
      "Looking for a clean M8 or 350z livery if anyone has one for sale.",
      "Drop the car name and specs, let me see what you're working with."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (t.includes("room") || t.includes("code") || /\b\d{6,8}\b/.test(t)) {
    const replies = [
      "Drop the lobby code bro, hopping in right now.",
      "Is the room open or full? Drop the code.",
      "Send the room ID, pulling up with my drag tune."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  const dynamicReplies = [
    "Fair enough bro, tell me what car you're working on today.",
    "Haha for real man. You hitting the city map or highway?",
    "That makes sense bro, have you tested that build on the strip yet?",
    "Nice one. Let me know if you need any gearbox numbers for that.",
    "I feel you bro. The competition in these lobbies has been crazy lately."
  ];
  return dynamicReplies[Math.floor(Math.random() * dynamicReplies.length)];
}

async function getBotReply(cleanName, cleanMsg) {
  const rawKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  const stripped = cleanMsg.replace(/@(apex|apex_racer)/gi, "").trim();

  if (rawKey) {
    try {
      const prompt = `You are Apex_Racer, a real human player chatting in the Car Parking Multiplayer game lobby. Talk like a real, chill car gamer buddy using simple slang. Answer this exact question from user ${cleanName}: "${stripped}". Keep it under 20 words, 1 short sentence, completely natural, direct, and friendly. Never mention AI, models, or bots.`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${rawKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(8000)
      });

      if (resp.ok) {
        const data = await resp.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply && reply.length <= 150) {
          return reply.replace(/["*]/g, "");
        }
      }
    } catch {}
  }

  return getHumanFallback(stripped || cleanMsg);
}

async function pruneOldMessages() {
  try {
    const countSnap = await db.collection("posts").count().get();
    const total = countSnap.data().count;
    if (total > 500) {
      const excess = total - 500;
      const oldestDocs = await db.collection("posts")
        .orderBy("createdAt", "asc")
        .limit(excess)
        .get();

      const pruneBatch = db.batch();
      oldestDocs.forEach(d => {
        pruneBatch.delete(d.ref);
        pruneBatch.delete(db.collection("ip_logs").doc(d.id));
      });
      await pruneBatch.commit();
    }
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
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
    const { action, postId, name, message, clientInfo, room, vipKey, nameColor } = req.body || {};

    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";
    const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');
    const isVpnDetected = checkVpnIndicators(req);

    if (action === "unlock_vip") {
      const siteBan = await db.collection("banned").doc(safeIp).get();
      if (siteBan.exists) return res.status(403).json({ error: "You are banned from this website." });

      const vipBan = await db.collection("vip_banned").doc(safeIp).get();
      if (vipBan.exists) return res.status(403).json({ error: "Your access to the VIP Lounge has been blocked by admin." });

      const pinDoc = await db.collection("pinned").doc("current").get();
      const validVipKey = pinDoc.exists && pinDoc.data().vipKey ? pinDoc.data().vipKey : "VIP777";

      if (!vipKey || String(vipKey).trim() !== String(validVipKey).trim()) {
        return res.status(403).json({ error: "Invalid VIP Access Passcode." });
      }

      const cleanName = (name || "VIP Driver").trim().substring(0, 20);
      const ua = req.headers['user-agent'] || '';
      const { os, browser, device } = parseUserAgent(ua);
      const countryCode = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
      let countryName = 'Unknown';
      if (countryCode && countryCode.length === 2) {
        try {
          countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
        } catch {
          countryName = countryCode;
        }
      }
      const city = req.headers['x-vercel-ip-city'] || '';

      const batch = db.batch();
      batch.set(db.collection("verified_ips").doc(safeIp), {
        ip: rawIp,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "vip_passcode"
      }, { merge: true });

      batch.set(db.collection("vip_members").doc(safeIp), {
        ip: rawIp,
        name: cleanName,
        device,
        os,
        browser,
        country: countryName,
        countryCode: countryCode || 'UN',
        city: city || 'Unknown City',
        isVpn: isVpnDetected,
        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await batch.commit();
      return res.status(200).json({ success: true, message: "VIP Lounge unlocked and Verified Driver badge granted!" });
    }

    if (action === "like") {
      if (!postId) return res.status(400).json({ error: "Missing postId" });
      await db.collection("posts").doc(postId).update({
        likes: admin.firestore.FieldValue.increment(1)
      });
      return res.status(200).json({ success: true });
    }

    if (action === "report") {
      if (!postId) return res.status(400).json({ error: "Missing postId" });
      await db.collection("posts").doc(postId).update({
        isReported: true,
        reportCount: admin.firestore.FieldValue.increment(1)
      });
      return res.status(200).json({ success: true });
    }

    const pinDoc = await db.collection("pinned").doc("current").get();
    if (pinDoc.exists && pinDoc.data().chatLocked) {
      return res.status(403).json({ error: "Chat is temporarily paused by admin." });
    }

    const validVipKey = pinDoc.exists && pinDoc.data().vipKey ? pinDoc.data().vipKey : "VIP777";
    const memberDoc = await db.collection("vip_members").doc(safeIp).get();
    const hasValidKey = vipKey && String(vipKey).trim() === String(validVipKey).trim();
    const isVipUser = memberDoc.exists || hasValidKey;

    const isVipRoom = room === "vip";
    if (isVipRoom) {
      const vipBan = await db.collection("vip_banned").doc(safeIp).get();
      if (vipBan.exists) {
        return res.status(403).json({ error: "You are blocked from the VIP Lounge." });
      }
      if (!isVipUser) {
        return res.status(403).json({ error: "Invalid VIP Access Passcode." });
      }
    }

    if (!name || !message) return res.status(400).json({ error: "Name and message required" });
    const cleanName = name.trim().substring(0, 20);
    const maxChars = isVipUser ? 250 : 150;
    const cleanMsg = message.trim().substring(0, maxChars);

    if (cleanName.length < 2) return res.status(400).json({ error: "Name too short" });
    if (RESERVED.includes(cleanName.toLowerCase())) return res.status(400).json({ error: "Name reserved" });

    const isBlocked = await containsBlockedContent(cleanMsg);
    if (isBlocked) {
      return res.status(400).json({ error: "Message blocked: words, links, or scam phrases are prohibited." });
    }

    const countryCode = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
    let countryName = 'Unknown';
    if (countryCode && countryCode.length === 2) {
      try {
        countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
      } catch {
        countryName = countryCode;
      }
    }

    const city = req.headers['x-vercel-ip-city'] || '';
    const region = req.headers['x-vercel-ip-country-region'] || '';
    const ua = req.headers['user-agent'] || '';
    const { os, browser, device } = parseUserAgent(ua);
    const client = clientInfo || {};

    const banSnap = await db.collection("banned").doc(safeIp).get();
    if (banSnap.exists) {
      const banData = banSnap.data();
      const until = banData.bannedUntil?._seconds ? banData.bannedUntil._seconds * 1000 : null;
      if (!until || until > Date.now()) {
        const reasonText = banData.reason ? `: ${banData.reason}` : "";
        return res.status(403).json({ error: `You are banned${reasonText}` });
      } else {
        await db.collection("banned").doc(safeIp).delete().catch(() => {});
      }
    }

    const verifiedSnap = await db.collection("verified_ips").doc(safeIp).get();
    const isIpVerified = verifiedSnap.exists || isVipUser;

    const dynamicSlowMode = pinDoc.exists && pinDoc.data().slowModeSeconds ? Number(pinDoc.data().slowModeSeconds) : 10;
    const cooldownWindow = isVipUser ? 2 : dynamicSlowMode;

    const rateRef = db.collection("rateLimits").doc(safeIp);
    const rateSnap = await rateRef.get();
    if (rateSnap.exists) {
      const last = rateSnap.data().lastPost?._seconds || rateSnap.data().lastPost?.seconds || 0;
      const now = Math.floor(Date.now() / 1000);
      if (now - last < cooldownWindow) {
        return res.status(429).json({ error: `Slow down ${cooldownWindow - (now - last)}s` });
      }
    }

    const sanitizedColor = (isVipUser && nameColor && ALLOWED_COLORS.includes(nameColor)) ? nameColor : null;

    const batch = db.batch();
    const postRef = db.collection("posts").doc();
    const logRef = db.collection("ip_logs").doc(postRef.id);

    batch.set(postRef, {
      name: cleanName,
      message: cleanMsg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isVerified: isIpVerified,
      isVip: isVipUser,
      isBot: false,
      likes: 0,
      isReported: false,
      reportCount: 0,
      room: isVipRoom ? "vip" : "public",
      nameColor: sanitizedColor
    });

    batch.set(logRef, {
      postId: postRef.id,
      ip: rawIp,
      country: countryName,
      countryCode: countryCode || 'UN',
      city: city || 'Unknown City',
      region: region,
      device: device,
      os: os,
      browser: browser,
      isVpn: isVpnDetected,
      battery: client.battery || 'N/A',
      ram: client.ram || 'N/A',
      cores: client.cores || 'N/A',
      screen: client.screen || 'N/A',
      network: client.network || 'N/A',
      referrer: client.referrer || 'Direct',
      name: cleanName,
      message: cleanMsg,
      room: isVipRoom ? "vip" : "public",
      nameColor: sanitizedColor,
      isVip: isVipUser,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    batch.set(rateRef, {
      lastPost: admin.firestore.FieldValue.serverTimestamp(),
      ip: rawIp
    }, { merge: true });

    await batch.commit();

    if (cleanMsg.toLowerCase().includes("@apex")) {
      const botText = await getBotReply(cleanName, cleanMsg);
      const botRef = db.collection("posts").doc();
      const botBatch = db.batch();

      botBatch.set(botRef, {
        name: "Apex_Racer",
        message: botText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isBot: true,
        isVerified: true,
        likes: 0,
        isReported: false,
        reportCount: 0,
        room: isVipRoom ? "vip" : "public"
      });
      botBatch.set(db.collection("ip_logs").doc(botRef.id), {
        postId: botRef.id,
        name: "Apex_Racer",
        message: botText,
        ip: "BOT",
        country: "Server",
        countryCode: "UN",
        city: "Cloud",
        device: "Server Bot",
        os: "Node.js",
        browser: "AI Engine",
        isVpn: false,
        room: isVipRoom ? "vip" : "public",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await botBatch.commit();
    }

    await pruneOldMessages();

    return res.status(200).json({
      success: true,
      projectId: serviceAccount?.project_id || "unknown"
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
