import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

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

function getDb() {
  if (!admin.apps.length) {
    const serviceKey = process.env.FIREBASE_SERVICE_KEY;
    if (!serviceKey) {
      throw new Error("FIREBASE_SERVICE_KEY is not configured");
    }
    let credentials;
    try {
      credentials = JSON.parse(serviceKey);
    } catch {
      throw new Error("FIREBASE_SERVICE_KEY is not valid JSON");
    }
    if (
      !credentials ||
      !credentials.project_id ||
      !credentials.client_email ||
      !credentials.private_key
    ) {
      throw new Error("FIREBASE_SERVICE_KEY is incomplete");
    }
    admin.initializeApp({
      credential: admin.credential.cert(credentials)
    });
  }
  return admin.firestore();
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Cache-Control", "no-store");
}

function getBearerToken(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function getRequestBody(req) {
  if (
    req.body &&
    typeof req.body === "object" &&
    !Array.isArray(req.body)
  ) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function isValidPhotoUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
      return res.status(403).end();
    }
    return res.status(200).end();
  }

  if (req.headers.origin && !isOriginAllowed(req.headers.origin)) {
    return sendError(res, 403, "Origin not allowed");
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendError(res, 405, "Method not allowed");
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return sendError(res, 401, "Unauthorized");
    }

    const decoded = verifyJwt(token);
    if (
      !decoded ||
      typeof decoded.username !== "string" ||
      !/^[A-Z0-9_.]{3,20}$/.test(decoded.username)
    ) {
      return sendError(res, 401, "Invalid or expired token");
    }

    const username = decoded.username;
    const db = getDb();
    const userRef = db.collection("users").doc(username);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendError(res, 404, "User not found");
    }

    const userData = userDoc.data() || {};

    if (req.method === "POST") {
      const body = getRequestBody(req);
      if (!Object.prototype.hasOwnProperty.call(body, "photoURL")) {
        return sendError(res, 400, "photoURL is required");
      }
      if (!isValidPhotoUrl(body.photoURL)) {
        return sendError(
          res,
          400,
          "photoURL must be a valid HTTPS URL"
        );
      }
      await userRef.update({
        photoURL: body.photoURL
      });
      return res.status(200).json({
        success: true,
        photoURL: body.photoURL
      });
    }

    const isAdmin = userData.role === "ADMIN";
    const isVip = isAdmin || userData.isVip === true;

    return res.status(200).json({
      username:
        typeof userData.username === "string"
          ? userData.username
          : username,
      isAdmin,
      isVip,
      photoURL:
        typeof userData.photoURL === "string"
          ? userData.photoURL
          : "",
      vipExpiresAt: userData.vipExpiresAt ?? null,
      customColor:
        typeof userData.customColor === "string"
          ? userData.customColor
          : "#f59e0b",
      customFrame:
        typeof userData.customFrame === "string"
          ? userData.customFrame
          : "gold",
      chatBg:
        typeof userData.chatBg === "string"
          ? userData.chatBg
          : "",
      lastUsernameChange: userData.lastUsernameChange ?? null
    });
  } catch {
    return sendError(res, 500, "Profile service error");
  }
}
