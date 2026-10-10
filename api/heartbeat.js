import admin from "firebase-admin";

let serviceAccount = null;
if (!admin.apps.length) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(',')[0].trim() || "unknown";
    const safeIp = rawIp.replace(/[^a-zA-Z0-9.:]/g, '_');

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
    const timezone = req.headers['x-vercel-ip-timezone'] || '';
    const ua = req.headers['user-agent'] || '';
    const { os, browser, device } = parseUserAgent(ua);

    const client = req.body || {};

    if (rawIp !== "unknown" && rawIp !== "BOT") {
      await db.collection("visitors").doc(safeIp).set({
        ip: rawIp,
        country: countryName,
        city: city || 'Unknown City',
        region: region,
        timezone: timezone,
        os: os,
        browser: browser,
        device: device,
        screen: client.screen || 'Unknown',
        battery: client.battery || 'N/A',
        ram: client.ram || 'N/A',
        cores: client.cores || 'N/A',
        network: client.network || 'N/A',
        lang: client.lang || 'N/A',
        referrer: client.referrer || 'Direct',
        lastSeen: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await db.collection("presence").doc(safeIp).set({
        lastSeen: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 45000);
    const countSnap = await db.collection("presence").where("lastSeen", ">=", cutoff).count().get();
    const activeCount = Math.max(1, countSnap.data().count);

    return res.status(200).json({ online: activeCount });
  } catch (err) {
    return res.status(200).json({ online: 1 });
  }
}
