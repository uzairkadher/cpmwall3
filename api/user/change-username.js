
import admin from "firebase-admin";
import { verifyJwt } from "../auth.js";

const ALLOWED_ORIGIN = "https://cpmwall3.vercel.app";
const USERNAME_PATTERN = /^[A-Z0-9_.]{3,20}$/;
const USERNAME_COOLDOWN_DAYS = 30;
const FIRESTORE_BATCH_LIMIT = 400;

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
  if (req.headers.origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

function getDateMillis(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

async function updateNamesInChunks(db, documents, newUsername) {
  for (
    let offset = 0;
    offset < documents.length;
    offset += FIRESTORE_BATCH_LIMIT
  ) {
    const batch = db.batch();
    const chunk = documents.slice(
      offset,
      offset + FIRESTORE_BATCH_LIMIT
    );

    for (const document of chunk) {
      batch.update(document.ref, { name: newUsername });
    }

    await batch.commit();
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
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
      !USERNAME_PATTERN.test(decoded.username)
    ) {
      return sendError(res, 401, "Invalid or expired token");
    }

    const body = getRequestBody(req);

    if (typeof body.newUsername !== "string") {
      return sendError(res, 400, "newUsername is required");
    }

    const oldUsername = decoded.username;
    const newUsername = body.newUsername.trim().toUpperCase();

    if (!USERNAME_PATTERN.test(newUsername)) {
      return sendError(
        res,
        400,
        "Invalid username format (3-20 chars: A-Z, 0-9, _, .)"
      );
    }

    if (newUsername === oldUsername) {
      return sendError(
        res,
        400,
        "New username is the same as current username"
      );
    }

    const db = getDb();
    const oldUserRef = db.collection("users").doc(oldUsername);
    const newUserRef = db.collection("users").doc(newUsername);

    // Read both username records and enforce uniqueness atomically.
    let migratedUserData;

    try {
      await db.runTransaction(async transaction => {
        const oldUserSnap = await transaction.get(oldUserRef);

        if (!oldUserSnap.exists) {
          const error = new Error("User not found");
          error.statusCode = 404;
          throw error;
        }

        const newUserSnap = await transaction.get(newUserRef);

        if (newUserSnap.exists) {
          const error = new Error("Username is already taken");
          error.statusCode = 409;
          throw error;
        }

        const userData = oldUserSnap.data() || {};

        if (userData.lastUsernameChange) {
          const lastChangeMillis = getDateMillis(
            userData.lastUsernameChange
          );

          if (lastChangeMillis === null) {
            const error = new Error(
              "Username cooldown data is invalid; contact support"
            );
            error.statusCode = 409;
            throw error;
          }

          const elapsedMillis = Date.now() - lastChangeMillis;
          const cooldownMillis =
            USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

          if (elapsedMillis < cooldownMillis) {
            const remainingDays = Math.ceil(
              (cooldownMillis - elapsedMillis) /
                (24 * 60 * 60 * 1000)
            );

            const error = new Error(
              `Username change locked. Please wait ${remainingDays} more days.`
            );
            error.statusCode = 403;
            throw error;
          }
        }

        migratedUserData = {
          ...userData,
          username: newUsername,
          lastUsernameChange:
            admin.firestore.FieldValue.serverTimestamp()
        };

        transaction.create(newUserRef, migratedUserData);
        transaction.delete(oldUserRef);
      });
    } catch (error) {
      if (error?.statusCode) {
        return sendError(res, error.statusCode, error.message);
      }

      throw error;
    }

    // Find existing content using the exact old display name.
    const [postsSnapshot, ipLogsSnapshot] = await Promise.all([
      db.collection("posts").where("name", "==", oldUsername).get(),
      db.collection("ip_logs").where("name", "==", oldUsername).get()
    ]);

    // Firestore batches have a finite write limit. Commit bounded batches
    // rather than attempting an unbounded single batch.
    await updateNamesInChunks(
      db,
      postsSnapshot.docs,
      newUsername
    );

    await updateNamesInChunks(
      db,
      ipLogsSnapshot.docs,
      newUsername
    );

    return res.status(200).json({
      success: true,
      newUsername,
      message: "Username changed. Please log in again."
    });
  } catch {
    return sendError(res, 500, "Username service error");
  }
}
