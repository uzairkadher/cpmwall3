
import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const RESERVED_HANDLES = [
  "ADMIN",
  "MOD",
  "SYSTEM",
  "OWNER",
  "VIP",
  "CPM"
];

const JWT_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const BCRYPT_ROUNDS = 12;
const ALLOWED_ORIGIN = "https://cpmwall3.vercel.app";

let dbInstance = null;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error("JWT_SECRET is missing or too short");
  }

  return secret;
}

function getDb() {
  if (dbInstance) return dbInstance;

  const serviceKey = process.env.FIREBASE_SERVICE_KEY;

  if (!serviceKey) {
    throw new Error("FIREBASE_SERVICE_KEY is not configured");
  }

  if (!admin.apps.length) {
    let credentials;

    try {
      credentials = JSON.parse(serviceKey);
    } catch {
      throw new Error("FIREBASE_SERVICE_KEY is not valid JSON");
    }

    if (
      !credentials ||
      typeof credentials !== "object" ||
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

  dbInstance = admin.firestore();
  return dbInstance;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT"
    })
  );

  const data = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + JWT_LIFETIME_SECONDS
    })
  );

  const unsignedToken = `${header}.${data}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

export function verifyJwt(token) {
  try {
    if (typeof token !== "string") return null;
    if (token.length === 0 || token.length > 8192) return null;

    const parts = token.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) {
      return null;
    }

    const [encodedHeader, encodedPayload, suppliedSignature] = parts;
    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8")
    );

    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }

    const secret = getJwtSecret();

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();

    const actualSignature = Buffer.from(
      suppliedSignature,
      "base64url"
    );

    if (
      actualSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }

    // New tokens use standard JWT seconds. Accept legacy millisecond
    // expiration values so existing, unexpired sessions can keep working.
    const expirationMillis =
      payload.exp > 1_000_000_000_000
        ? payload.exp
        : payload.exp * 1000;

    if (expirationMillis <= Date.now()) {
      return null;
    }

    if (
      typeof payload.username !== "string" ||
      !/^[A-Z0-9_.]{3,20}$/.test(payload.username)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function hashLegacyPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password + "cpm_salt_2025")
    .digest("hex");
}

function verifyLegacyPassword(password, storedHash) {
  if (
    typeof storedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(storedHash)
  ) {
    return false;
  }

  const expected = Buffer.from(hashLegacyPassword(password), "hex");
  const actual = Buffer.from(storedHash, "hex");

  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

async function verifyStoredPassword(password, userData) {
  if (
    typeof userData.passwordHash === "string" &&
    userData.passwordHash.startsWith("$2")
  ) {
    try {
      if (await bcrypt.compare(password, userData.passwordHash)) {
        return { valid: true, needsUpgrade: true };
      }
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  if (typeof userData.passHash === "string") {
    if (userData.passHash.startsWith("$2")) {
      try {
        if (await bcrypt.compare(password, userData.passHash)) {
          return { valid: true, needsUpgrade: true };
        }
      } catch {
        return { valid: false, needsUpgrade: false };
      }
    } else if (verifyLegacyPassword(password, userData.passHash)) {
      return { valid: true, needsUpgrade: true };
    }
  }

  return { valid: false, needsUpgrade: false };
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== "string") return null;

  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function getRequestBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

async function registerUser(db, cleanUser, password) {
  const userRef = db.collection("users").doc(cleanUser);
  const passHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const rawIp = String(
    (arguments[3]?.headers?.["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() || "unknown"
  );

  await db.runTransaction(async transaction => {
    const existing = await transaction.get(userRef);

    if (existing.exists) {
      const error = new Error("Username taken");
      error.statusCode = 409;
      throw error;
    }

    transaction.create(userRef, {
      username: cleanUser,
      passwordHash: passHash,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ip: rawIp
    });
  });

  return {
    token: signJwt({ username: cleanUser }),
    username: cleanUser
  };
}

async function migrateUserAfterLogin(
  db,
  cleanUser,
  sourceRef,
  userData,
  passwordHash,
  isLegacyDocument
) {
  const canonicalRef = db.collection("users").doc(cleanUser);

  await db.runTransaction(async transaction => {
    const sourceSnap = await transaction.get(sourceRef);

    if (!sourceSnap.exists) {
      const error = new Error("Account changed during login. Please retry.");
      error.statusCode = 409;
      throw error;
    }

    const currentData = sourceSnap.data();

    // Do not overwrite a concurrent password change.
    if (
      currentData.passwordHash !== userData.passwordHash ||
      currentData.passHash !== userData.passHash
    ) {
      const error = new Error("Account changed during login. Please retry.");
      error.statusCode = 409;
      throw error;
    }

    if (isLegacyDocument) {
      const canonicalSnap = await transaction.get(canonicalRef);

      if (canonicalSnap.exists) {
        const error = new Error("Account migration conflict. Please retry.");
        error.statusCode = 409;
        throw error;
      }

      const migratedData = {
        ...currentData,
        username: cleanUser,
        passwordHash,
        migratedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      delete migratedData.passHash;

      transaction.create(canonicalRef, migratedData);
      transaction.delete(sourceRef);
    } else {
      transaction.update(sourceRef, {
        passwordHash,
        passHash: admin.firestore.FieldValue.delete(),
        passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendError(res, 405, "Method not allowed");
  }

  try {
    const action = typeof req.query?.action === "string"
      ? req.query.action
      : "";

    if (req.method === "GET" && action === "me") {
      const token = getBearerToken(req);

      if (!token) {
        return sendError(res, 401, "Missing token");
      }

      const decoded = verifyJwt(token);

      if (!decoded || !decoded.username) {
        return sendError(res, 401, "Invalid token");
      }

      return res.status(200).json({
        username: decoded.username
      });
    }

    if (req.method !== "POST") {
      return sendError(res, 400, "Invalid auth action");
    }

    const { username, password, confirmPassword } = getRequestBody(req);
    const cleanUser = String(username || "").trim().toUpperCase();

    if (action !== "register" && action !== "login") {
      return sendError(res, 400, "Invalid auth action");
    }

    if (!/^[A-Z0-9_.]{3,20}$/.test(cleanUser)) {
      return sendError(
        res,
        400,
        "Invalid username format (3-20 chars: A-Z, 0-9, _, .)"
      );
    }

    if (typeof password !== "string" || password.length === 0) {
      return sendError(res, 400, "Password is required");
    }

    if (action === "register") {
      if (RESERVED_HANDLES.includes(cleanUser)) {
        return sendError(
          res,
          400,
          "This username is reserved and cannot be registered."
        );
      }

      if (password.length < 6) {
        return sendError(res, 400, "Password must be at least 6 characters");
      }

      if (password.length > 1024) {
        return sendError(res, 400, "Password is too long");
      }

      if (password !== confirmPassword) {
        return sendError(res, 400, "Passwords do not match");
      }

      getJwtSecret();
      const db = getDb();
      const userRef = db.collection("users").doc(cleanUser);
      const passHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const rawIp = String(
        (req.headers["x-forwarded-for"] || "")
          .split(",")[0]
          .trim() || "unknown"
      );

      await db.runTransaction(async transaction => {
        const existing = await transaction.get(userRef);

        if (existing.exists) {
          const error = new Error("Username taken");
          error.statusCode = 409;
          throw error;
        }

        transaction.create(userRef, {
          username: cleanUser,
          passwordHash: passHash,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ip: rawIp
        });
      });

      const token = signJwt({ username: cleanUser });

      return res.status(200).json({
        token,
        username: cleanUser
      });
    }

    if (password.length > 1024) {
      return sendError(res, 400, "Invalid credentials");
    }

    getJwtSecret();
    const db = getDb();
    const canonicalRef = db.collection("users").doc(cleanUser);
    let sourceRef = canonicalRef;
    let userSnap = await canonicalRef.get();
    let isLegacyDocument = false;

    if (!userSnap.exists) {
      sourceRef = db.collection("users").doc(cleanUser.toLowerCase());
      userSnap = await sourceRef.get();
      isLegacyDocument = userSnap.exists;
    }

    if (!userSnap.exists) {
      return sendError(res, 401, "Invalid username or password");
    }

    const userData = userSnap.data() || {};
    const passwordResult = await verifyStoredPassword(password, userData);

    if (!passwordResult.valid) {
      return sendError(res, 401, "Invalid username or password");
    }

    if (passwordResult.needsUpgrade) {
      const upgradedHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await migrateUserAfterLogin(
        db,
        cleanUser,
        sourceRef,
        userData,
        upgradedHash,
        isLegacyDocument
      );
    }

    const token = signJwt({ username: cleanUser });

    return res.status(200).json({
      token,
      username: cleanUser
    });
  } catch (err) {
    if (err?.statusCode === 409) {
      return sendError(res, 409, err.message);
    }

    // Keep credential/configuration details out of public error responses.
    return sendError(res, 500, "Authentication service error");
  }
}
