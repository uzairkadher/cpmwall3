import admin from "firebase-admin";
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY)) });
}
const db = admin.firestore();
const RESERVED = ["admin", "apex_racer", "system", "moderator", "cpm_bot"];
const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg|t\.me|telegram\.me|\.com|\.gg)/i;
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method!== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { name, message } = req.body || {};
    if (!name ||!message) return res.status(400).json({ error: "Name and message required" });
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
      if (now - last < 15) return res.status(429).json({ error: `Slow down ${15 - (now - last)}s` });
    }
    const batch = db.batch();
    const postRef = db.collection("posts").doc();
    const logRef = db.collection("ip_logs").doc(postRef.id);
    batch.set(logRef, { postId: postRef.id, ip: rawIp, name: cleanName, message: cleanMsg, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(rateRef, { lastPost: admin.firestore.FieldValue.serverTimestamp(), ip: rawIp }, { merge: true });
    batch.set(postRef, { name: cleanName, message: cleanMsg, createdAt: admin.firestore.FieldValue.serverTimestamp(), isVerified: false, isBot: false });
    await batch.commit();
    if (cleanMsg.toLowerCase().includes("@apex")) {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: `You are Apex_Racer, CPM expert. Short cool reply under 100 chars. User ${cleanName}: ${cleanMsg}` }] }] }),
            signal: AbortSignal.timeout(4000)
          });
          const data = await resp.json();
          let botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Yo! Ask me drift, gearbox or room codes.";
          botText = botText.substring(0, 150);
          const botRef = db.collection("posts").doc();
          const botBatch = db.batch();
          botBatch.set(botRef, { name: "Apex_Racer", message: botText, createdAt: admin.firestore.FieldValue.serverTimestamp(), isBot: true, isVerified: true });
          botBatch.set(db.collection("ip_logs").doc(botRef.id), { postId: botRef.id, name: "Apex_Racer", message: botText, ip: "BOT", createdAt: admin.firestore.FieldValue.serverTimestamp() });
          await botBatch.commit();
        }
      } catch (e) {
        console.error("Bot fail", e.message);
        const botRef = db.collection("posts").doc();
        await botRef.set({ name: "Apex_Racer", message: "Yo! I'm here. Ask me about tunes, drag or rooms.", createdAt: admin.firestore.FieldValue.serverTimestamp(), isBot: true, isVerified: true });
      }
    }
    return res.status(200).json({ success: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
}