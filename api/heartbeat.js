import admin from "firebase-admin";
import crypto from "crypto";

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

const PRESENCE_WINDOW_MS = 45_000;

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

function setCors(req, res) {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Cache-Control", "no-store");
}

function cleanString(value, maxLength, fallback = "N/A") {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function safeNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const integer = Math.floor(number);
  if (integer < min || integer > max) return null;
  return integer;
}

function getClientIp(req) {
  // Vercel's forwarded header should only be trusted when supplied
  // by the hosting platform. Never trust arbitrary body-supplied IPs.
  const candidate =
    req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "";
  const ip = String(candidate).split(",")[0].trim();
  if (
    ip.length > 64 ||
    !/^[a-fA-F0-9:.]+$/.test(ip)
  ) {
    return "unknown";
  }
  return ip;
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function parseUserAgent(ua = "") {
  let os = "Unknown OS";
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/instagram/i.test(ua)) browser = "Instagram App";
  else if (/whatsapp/i.test(ua)) browser = "WhatsApp App";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";

  let device = "Desktop";
  if (/ipad/i.test(ua)) device = "iPad";
  else if (/iphone/i.test(ua)) device = "iPhone";
  else if (/android|mobile/i.test(ua)) device = "Mobile";

  return { os, browser, device };
}

function countryNameFromCode(code) {
  if (!/^[A-Z]{2}$/.test(code)) return "Unknown";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(code) ||
      "Unknown"
    );
  } catch {
    return "Unknown";
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
      return res.status(403).end();
    }
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  if (
    req.headers.origin &&
    !isOriginAllowed(req.headers.origin)
  ) {
    return res.status(403).json({
      error: "Origin not allowed."
    });
  }

  let db;
  try {
    db = getDb();
  } catch {
    return res.status(500).json({
      error: "Server configuration error."
    });
  }

  try {
    const rawIp = getClientIp(req);
    const ua = cleanString(
      req.headers["user-agent"],
      512,
      ""
    );
    const client =
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
        ? req.body
        : {};

    const { os, browser, device } = parseUserAgent(ua);
    const countryCode = cleanString(
      req.headers["x-vercel-ip-country"],
      2,
      ""
    ).toUpperCase();
    const country = countryNameFromCode(countryCode);
    const city = cleanString(
      req.headers["x-vercel-ip-city"],
      100,
      "Unknown City"
    );
    const region = cleanString(
      req.headers["x-vercel-ip-country-region"],
      100
    );
    const timezone = cleanString(
      req.headers["x-vercel-ip-timezone"],
      100
    );

    const screen = cleanString(client.screen, 40);
    const lang = cleanString(client.lang, 35);
    const network = cleanString(client.network, 40);
    const referrer = cleanString(client.referrer, 300, "Direct");
    const batteryNumber = safeNumber(client.battery, 0, 100);
    const ramNumber = safeNumber(client.ram, 1, 1024);
    const coresNumber = safeNumber(client.cores, 1, 512);

    if (rawIp !== "unknown") {
      const ipKey = hashIp(rawIp);
      const now = admin.firestore.FieldValue.serverTimestamp();

      // The visitor record is keyed by a one-way IP hash instead of
      // a directly readable IP address.
      await db.collection("visitors").doc(ipKey).set({
        ipHash: ipKey,
        country,
        city,
        region,
        timezone,
        os,
        browser,
        device,
        screen,
        battery: batteryNumber === null
          ? "N/A"
          : batteryNumber,
        ram: ramNumber === null
          ? "N/A"
          : ramNumber,
        cores: coresNumber === null
          ? "N/A"
          : coresNumber,
        network,
        lang,
        referrer,
        lastSeen: now
      }, { merge: true });

      await db.collection("presence").doc(ipKey).set({
        lastSeen: now
      }, { merge: true });
    }

    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - PRESENCE_WINDOW_MS
    );
    const countSnap = await db
      .collection("presence")
      .where("lastSeen", ">=", cutoff)
      .count()
      .get();

    const online = Math.max(
      1,
      Number(countSnap.data()?.count) || 0
    );

    return res.status(200).json({ online });
  } catch (error) {
    console.error(
      "Heartbeat failure:",
      error?.message || "Unknown error"
    );
    return res.status(503).json({
      error: "Heartbeat temporarily unavailable."
    });
  }
}
