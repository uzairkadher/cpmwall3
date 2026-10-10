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

function getHumanFallback(cleanMsg) {
  const text = cleanMsg.toLowerCase();

  if (text.includes("supra") || text.includes("gearbox") || text.includes("gear")) {
    const gearboxTunes = [
      "For Supra set Final Drive 3.12, 1st 2.66, 2nd 1.90. Shifts fast and clean.",
      "Run Final Drive 2.80 with AWD on Supra, easy sub-6 on the strip.",
      "Keep 1st gear long around 2.70 so you do not spin tires off the line."
    ];
    return gearboxTunes[Math.floor(Math.random() * gearboxTunes.length)];
  }

  if (text.includes("drag") || text.includes("speed") || text.includes("fast")) {
    const dragTips = [
      "Drop tire pressure to 1.2 bar and launch in 2nd gear bro.",
      "Turn off TCS and ESP before staging, thank me later.",
      "Max out torque, run AWD, and shift right at the redline."
    ];
    return dragTips[Math.floor(Math.random() * dragTips.length)];
  }

  if (text.includes("drift")) {
    const driftTips = [
      "RWD mode, steer angle at 60, 0% front camber, and stiff rear suspension.",
      "Lock steering angle to 58 and pump the handbrake into the corner."
    ];
    return driftTips[Math.floor(Math.random() * driftTips.length)];
  }

  if (text.includes("trade") || text.includes("sell") || text.includes("buy")) {
    const tradeReplies = [
      "What you got to trade bro? Got any clean liveries or w16?",
      "Looking for a clean M8 or 350z livery if anyone is selling.",
      "Drop the car and specs, let me see what you have."
    ];
    return tradeReplies[Math.floor(Math.random() * tradeReplies.length)];
  }

  if (text.includes("room") || text.includes("code") || /\b\d{6,8}\b/.test(text)) {
    const roomReplies = [
      "Send the lobby code bro, hopping in right now.",
      "Is the room full or are you starting a new lobby?",
      "Drop the code, pulling up with the drag tune."
    ];
    return roomReplies[Math.floor(Math.random() * roomReplies.length)];
  }

  const generalReplies = [
    "What car are you building right now bro?",
    "Yo, you hitting the drag strip or cruising city?",
    "What tune do you need help with?",
    "Sup bro, ready to run on the strip whenever."
  ];
  return generalReplies[Math.floor(Math.random() * generalReplies.length)];
}

async function getBotReply(cleanName, cleanMsg) {
  const rawKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  const stripped = cleanMsg.replace(/@(apex|apex_racer)/gi, "").trim();

  if (rawKey) {
    try {
      const prompt = `You are Apex_Racer, a real human player in Car Parking Multiplayer lobby chat. You talk like a real teenage car gamer (chill, direct, gamer slang, no AI tone). Reply in 1 short sentence under 20 words directly answering this message from ${cleanName}: "${stripped}". Never say you are an AI or bot.`;
      
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${rawKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(4500)
      });

      if (resp.ok) {
        const data = await resp.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply && reply.length <= 150) {
          return reply.replace(/["*]/g, "");
        }
      }
    } catch (err) {
      console.error("Gemini fetch exception:", err.message);
    }
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

    // Check if IP is verified
    const verifiedSnap = await db.collection("verified_ips").doc(safeIp).get();
    const isIpVerified = verifiedSnap.exists;

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
      isVerified: isIpVerified,
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
