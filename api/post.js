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
const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg|t\.me|telegram\.me|\.com|\.gg)/i;

async function getBotReply(cleanName, cleanMsg) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "Yo! I'm here. Ask me about tunes, drag setups, or room codes.";
  }
  try {
    const prompt = `You are Apex_Racer, a pro Car Parking Multiplayer player in lobby chat. Reply in 1 short sentence (under 20 words), casual gamer slang, helpful with setups, tunes, or codes. User ${cleanName} said: "${cleanMsg.replace(/@(apex|apex_racer)/gi, '').trim()}". Reply as Apex_Racer, natural, no AI mention.`;
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(4000)
    });
    const data = await resp.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (reply && reply.length <= 150) {
      return reply.replace(/["*]/g, '');
    }
    return "Yo! Ask me about drift, gearbox setups, or room codes.";
  } catch {
    return "Yo! I'm here. Ask me about tunes, drag setups, or room codes.";
  }
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
  } catch (err) {
    console.error("Prune error:", err);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { name, message } = req.body || {};
    if (!name || !message) return res.status(400).json({ error: "Name and message required" });
    const cleanName = name.trim().substring(0, 20);
    const cleanMsg = message.trim().substring(0, 150);
    if (cleanName.length < 2) return res.status(400).json({ error: "Name too short" });
    if (RESERVED.includes(cleanName.toLowerCase())) return res.status(400).json({ error: "Name reserved" });
    if (LINK_REGEX.test(cleanMsg)) return res.status(400).json({ error: "Links not allowed" });

    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";
    const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');

    const banSnap = await db.collection("banned").doc(safeIp).get();
    if (banSnap.exists) return res.status(403).json({ error: "You are banned" });

    const rateRef = db.collection("rateLimits").doc(safeIp);
    const rateSnap = await rateRef.get();
    if (rateSnap.exists) {
      const last = rateSnap.data().lastPost?._seconds || rateSnap.data().lastPost?.seconds || 0;
      const now = Math.floor(Date.now() / 1000);
      if (now - last < 10) return res.status(429).json({ error: `Slow down ${10 - (now - last)}s` });
    }

    const batch = db.batch();
    const postRef = db.collection("posts").doc();
    const logRef = db.collection("ip_logs").doc(postRef.id);

    batch.set(postRef, {
      name: cleanName,
      message: cleanMsg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isVerified: false,
      isBot: false
    });
    batch.set(logRef, {
      postId: postRef.id,
      ip: rawIp,
      name: cleanName,
      message: cleanMsg,
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
        isVerified: true
      });
      botBatch.set(db.collection("ip_logs").doc(botRef.id), {
        postId: botRef.id,
        name: "Apex_Racer",
        message: botText,
        ip: "BOT",
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
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
