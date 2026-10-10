import admin from 'firebase-admin';
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const RESERVED = ['apex_racer', 'admin', 'moderator', 'system', 'cpm_bot'];
const LINK_REGEX = /(https?:\/\/|www\.|t\.me\/|discord\.gg|bit\.ly|\.gg|\.xyz)/i;

async function callAIBot(userName, userMessage) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const cleanMessage = userMessage.replace(/@(apex|apex_racer|ai|bot)/gi, '').trim() || 'yo';
    const prompt = `You are Apex_Racer, a pro Car Parking Multiplayer player in lobby chat. Reply in 1 short sentence (under 25 words), casual gamer slang, helpful with setups, tunes, or codes. User ${userName} said: "${cleanMessage}". Reply as Apex_Racer, natural, no AI mention.`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(4000)
    });
    const j = await r.json();
    const reply = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply || reply.length > 200) return null;
    return reply.replace(/["*]/g, '').slice(0, 150);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');
  const { name, message } = req.body || {};

  if (!message || !message.trim()) return res.status(400).json({ error: 'Empty message' });
  if (message.length > 150) return res.status(400).json({ error: 'Too long (max 150 chars)' });
  if (LINK_REGEX.test(message) || LINK_REGEX.test(name || '')) return res.status(400).json({ error: 'Links/ads not allowed' });

  const cleanName = (name || 'Anonymous').substring(0, 20).trim();
  if (RESERVED.includes(cleanName.toLowerCase())) return res.status(400).json({ error: 'Name reserved' });

  try {
    const banDoc = await db.collection('banned').doc(safeIp).get();
    if (banDoc.exists) return res.status(403).json({ error: 'You are banned from this wall' });

    const rateRef = db.collection('rateLimits').doc(safeIp);
    const rateDoc = await rateRef.get();
    if (rateDoc.exists) {
      const lastTime = rateDoc.data().lastPost?.toMillis?.() || 0;
      if (Date.now() - lastTime < 15000) {
        return res.status(429).json({ error: 'Cooldown active. Please wait 15 seconds.' });
      }
    }

    const postRef = db.collection('posts').doc();
    const batch = db.batch();
    batch.set(postRef, {
      name: cleanName,
      message: message.substring(0, 150),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isBot: false
    });
    batch.set(db.collection('ip_logs').doc(postRef.id), {
      postId: postRef.id,
      name: cleanName,
      message: message.substring(0, 150),
      ip: rawIp,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    batch.set(rateRef, { lastPost: admin.firestore.FieldValue.serverTimestamp(), ip: rawIp }, { merge: true });
    await batch.commit();

    if (message.toLowerCase().includes('@apex')) {
      const botReply = await callAIBot(cleanName, message);
      if (botReply) {
        const botRef = db.collection('posts').doc();
        const botBatch = db.batch();
        botBatch.set(botRef, {
          name: 'Apex_Racer',
          message: botReply,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isBot: true
        });
        botBatch.set(db.collection('ip_logs').doc(botRef.id), {
          postId: botRef.id,
          name: 'Apex_Racer',
          message: botReply,
          ip: 'BOT',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await botBatch.commit();
      }
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}