import admin from "firebase-admin";

let serviceAccount = null;
if (!admin.apps.length) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";
    const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');

    await db.collection("presence").doc(safeIp).set({
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 45000);
    const countSnap = await db.collection("presence").where("lastSeen", ">=", cutoff).count().get();
    const activeCount = Math.max(1, countSnap.data().count);

    return res.status(200).json({ online: activeCount });
  } catch (err) {
    return res.status(200).json({ online: 1 });
  }
}
