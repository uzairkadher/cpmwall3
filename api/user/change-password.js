import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 1024;

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

function verifyLegacyPassword(password, storedHash) {
  if (
    typeof storedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(storedHash)
  ) {
    return false;
  }

  const expected = crypto
    .createHash("sha256")
    .update(password + "cpm_salt_2025")
    .digest();
  const actual = Buffer.from(storedHash, "hex");

  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

async function verifyCurrentPassword(password, userData) {
  const passwordHash = userData.passwordHash;
  const passHash = userData.passHash;

  if (
    typeof passwordHash === "string" &&
    /^\$2[aby]\$/.test(passwordHash)
  ) {
    try {
      return await bcrypt.compare(password, passwordHash);
    } catch {
      return false;
    }
  }

  if (typeof passHash === "string") {
    if (/^\$2[aby]\$/.test(passHash)) {
      try {
        return await bcrypt.compare(password, passHash);
      } catch {
        return false;
      }
    }
    return verifyLegacyPassword(password, passHash);
  }

  return false;
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

    if (req.method === "GET") {
      const isAdmin = userData.role === "ADMIN";
      return res.status(200).json({
        username:
          typeof userData.username === "string"
            ? userData.username
            : username,
        isAdmin,
        isVip: isAdmin || userData.isVip === true,
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
    }

    const { oldPassword, newPassword } = getRequestBody(req);

    if (
      typeof oldPassword !== "string" ||
      typeof newPassword !== "string" ||
      oldPassword.length === 0 ||
      newPassword.length === 0
    ) {
      return sendError(
        res,
        400,
        "Current password and new password are required"
      );
    }

    if (
      oldPassword.length > MAX_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return sendError(res, 400, "Password is too long");
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return sendError(
        res,
        400,
        "New password must be at least 6 characters"
      );
    }

    if (oldPassword === newPassword) {
      return sendError(
        res,
        400,
        "New password must be different from your current password"
      );
    }

    const isOldPasswordValid = await verifyCurrentPassword(
      oldPassword,
      userData
    );

    if (!isOldPasswordValid) {
      return sendError(res, 401, "Current password is incorrect");
    }

    const newPasswordHash = await bcrypt.hash(
      newPassword,
      BCRYPT_ROUNDS
    );

    await db.runTransaction(async transaction => {
      const currentSnapshot = await transaction.get(userRef);
      if (!currentSnapshot.exists) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const currentData = currentSnapshot.data() || {};

      // Ensure the password has not changed since it was verified.
      if (
        currentData.passwordHash !== userData.passwordHash ||
        currentData.passHash !== userData.passHash
      ) {
        const error = new Error(
          "Account changed during the password update. Please log in again."
        );
        error.statusCode = 409;
        throw error;
      }

      transaction.update(userRef, {
        passwordHash: newPasswordHash,
        passHash: admin.firestore.FieldValue.delete(),
        passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return res.status(200).json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (error) {
    if (error?.statusCode === 404) {
      return sendError(res, 404, "User not found");
    }
    if (error?.statusCode === 409) {
      return sendError(
        res,
        409,
        "Account changed during the password update. Please log in again."
      );
    }
    return sendError(res, 500, "Password service error");
  }
}