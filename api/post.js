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

function isNameImpersonating(name = "") {
  const normalized = name.toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');

  const protectedWords = ["admin", "administrator", "apex", "apexracer", "moderator", "system", "cpmwall", "jagga", "4tjagga", "cpmofficial"];
  return protectedWords.some(w => normalized.includes(w));
}

function getSubnet24(ip = "") {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  }
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

async function sendAlertWebhook(title, message) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🚨 **${title}**\n${message}`
      })
    });
  } catch {}
}

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
  const xForwardedFor = headers["x-forwarded-for"];
  const proxyHeaders = ["x-real-ip", "via", "forwarded", "x-cluster-client-ip"];
  const hasMultipleIps = xForwardedFor && xForwardedFor.includes(",");
  const hasProxyHeader = proxyHeaders.some(h => Boolean(headers[h]));
  return Boolean(hasMultipleIps || hasProxyHeader || headers["cf-ray"]?.includes("TOR"));
}

function getHumanFallback(cleanMsg) {
  const t = cleanMsg.toLowerCase();
  if (t.includes("supra") || t.includes("gearbox") || t.includes("gear")) {
    return "For Supra set Final Drive 3.12, 1st 2.66, 2nd 1.90. Shift fast right at redline.";
  }
  if (t.includes("drag") || t.includes("launch")) {
    return "Drop tire pressure to 1.2 bar, turn off TCS, and launch in 2nd gear bro.";
  }
  return "What car are you tuning right now bro? Drop specs and room code.";
}

async function getBotReply(cleanName, cleanMsg) {
  const rawKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  const stripped = cleanMsg.replace(/@(apex|apex_racer)/gi, "").trim();

  if (rawKey) {
    try {
      const prompt = `You are Apex_Racer, a real human player in the Car Parking Multiplayer game lobby. Talk like a friendly car gamer buddy. Reply to ${cleanName}: "${stripped}". Keep it under 20 words, 1 sentence, natural and simple. Never mention AI or bots.`;
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${rawKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) {
        const data = await resp.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply && reply.length <= 150) return reply.replace(/["*]/g, "");
      }
    } catch {}
  }
  return getHumanFallback(stripped || cleanMsg);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const snap = await db.collection("posts").orderBy("createdAt", "desc").limit(100).get();
      const posts = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => !p.isShadowbanned);
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
    const ua = req.headers['user-agent'] || '';
    const { os, browser, device } = parseUserAgent(ua);
    const client = clientInfo || {};
    const fingerprint = getDeviceFingerprint(client, ua);

    // 1. Check Subnet Ban
    const subnet = getSubnet24(rawIp);
    if (subnet) {
      const subnetDoc = await db.collection("subnet_bans").doc(subnet.replace(/\*/g, '0')).get();
      if (subnetDoc.exists) {
        return res.status(403).json({ error: "Your mobile network subnet is banned from posting." });
      }
    }

    // 2. Check Device Hardware Fingerprint Ban
    if (fingerprint) {
      const fpDoc = await db.collection("fingerprint_bans").doc(fingerprint).get();
      if (fpDoc.exists) {
        return res.status(403).json({ error: "Your device hardware signature has been permanently blocked." });
      }
    }

    // 3. Check Standard IP Ban
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

    const pinDoc = await db.collection("pinned").doc("current").get();
    const pinData = pinDoc.exists ? pinDoc.data() : {};

    // 4. Handle VIP Unlock Action
    if (action === "unlock_vip") {
      const vipBan = await db.collection("vip_banned").doc(safeIp).get();
      if (vipBan.exists) return res.status(403).json({ error: "Your access to VIP Lounge is blocked." });

      const validVipKey = pinData.vipKey || "VIP777";
      if (!vipKey || String(vipKey).trim() !== String(validVipKey).trim()) {
        return res.status(403).json({ error: "Invalid VIP Access Passcode." });
      }

      const cleanName = (name || "VIP Driver").trim().substring(0, 20);
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
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000);

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
        fingerprint,
        country: countryName,
        countryCode: countryCode || 'UN',
        city: city || 'Unknown City',
        isVpn: isVpnDetected,
        unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt
      }, { merge: true });

      await batch.commit();
      return res.status(200).json({ success: true, message: "VIP Lounge unlocked (Active for 30 days)!" });
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
      const pRef = db.collection("posts").doc(postId);
      await pRef.update({
        isReported: true,
        reportCount: admin.firestore.FieldValue.increment(1)
      });
      const updatedSnap = await pRef.get();
      const updatedData = updatedSnap.data();
      if (updatedData && updatedData.reportCount >= 3) {
        await sendAlertWebhook("Post Flagged 3+ Times", `Author: ${updatedData.name}\nMessage: "${updatedData.message}"\nPost ID: ${postId}`);
      }
      return res.status(200).json({ success: true });
    }

    if (pinData.chatLocked) {
      return res.status(403).json({ error: "Chat is temporarily paused by admin." });
    }

    // Check VIP status & Expiration
    const memberDoc = await db.collection("vip_members").doc(safeIp).get();
    let isVipUser = false;
    if (memberDoc.exists) {
      const mData = memberDoc.data();
      if (mData.expiresAt && mData.expiresAt.toDate && mData.expiresAt.toDate() < new Date()) {
        isVipUser = false;
      } else {
        isVipUser = true;
      }
    }
    const validVipKey = pinData.vipKey || "VIP777";
    if (vipKey && String(vipKey).trim() === String(validVipKey).trim()) {
      isVipUser = true;
    }

    const verifiedSnap = await db.collection("verified_ips").doc(safeIp).get();
    const isIpVerified = verifiedSnap.exists || isVipUser;

    // 5. Panic Raid Mode Check
    if (pinData.raidMode && !isVipUser && !isIpVerified) {
      return res.status(403).json({ error: "Panic Raid Mode is active: Only Verified & VIP drivers can post right now." });
    }

    const isVipRoom = room === "vip";
    if (isVipRoom && !isVipUser) {
      return res.status(403).json({ error: "Invalid VIP Access Passcode or membership expired." });
    }

    if (!name || !message) return res.status(400).json({ error: "Name and message required" });
    const cleanName = name.trim().substring(0, 20);
    const maxChars = isVipUser ? 250 : 150;
    const cleanMsg = message.trim().substring(0, maxChars);

    if (cleanName.length < 2) return res.status(400).json({ error: "Name too short" });
    if (RESERVED.includes(cleanName.toLowerCase())) return res.status(400).json({ error: "Name reserved" });

    // 6. Name Impersonation Auto-Block
    if (isNameImpersonating(cleanName)) {
      return res.status(400).json({ error: "This driver tag resembles official staff handles and cannot be used." });
    }

    // 7. Profanity Strike Counter (Auto-Ban on 3 Strikes)
    const isBlocked = await containsBlockedContent(cleanMsg);
    if (isBlocked) {
      const strikeRef = db.collection("strikes").doc(safeIp);
      const strikeDoc = await strikeRef.get();
      const strikeCount = (strikeDoc.exists ? strikeDoc.data().count || 0 : 0) + 1;

      await strikeRef.set({
        ip: rawIp,
        count: strikeCount,
        lastStrikeAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if (strikeCount >= 3) {
        const bannedUntil = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000);
        await db.collection("banned").doc(safeIp).set({
          ip: rawIp,
          reason: "Automated: 3 profanity strikes reached",
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          bannedUntil
        });
        await sendAlertWebhook("Automated 24h Ban", `IP ${rawIp} hit 3 profanity strikes and was automatically banned.`);
        return res.status(403).json({ error: "You received 3 strikes for prohibited words and are banned for 24 hours." });
      }

      return res.status(400).json({ error: `Message blocked. Strike ${strikeCount}/3 recorded. 3 strikes will trigger an automatic 24-hour ban.` });
    }

    // 8. Silent Shadowban Check
    const shadowDoc = await db.collection("shadowbanned").doc(safeIp).get();
    const isShadowbanned = shadowDoc.exists;

    // Rate Limiting
    const dynamicSlowMode = pinData.slowModeSeconds ? Number(pinData.slowModeSeconds) : 10;
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
      nameColor: sanitizedColor,
      isShadowbanned: isShadowbanned
    });

    batch.set(logRef, {
      postId: postRef.id,
      ip: rawIp,
      subnet: subnet || 'N/A',
      fingerprint: fingerprint,
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
      isShadowbanned: isShadowbanned,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    batch.set(rateRef, {
      lastPost: admin.firestore.FieldValue.serverTimestamp(),
      ip: rawIp
    }, { merge: true });

    await batch.commit();

    if (cleanMsg.toLowerCase().includes("@apex") && !isShadowbanned) {
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

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
