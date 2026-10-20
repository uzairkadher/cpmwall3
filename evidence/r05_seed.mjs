import { generateKeyPairSync } from "node:crypto";
import admin from "firebase-admin";
import bcrypt from "bcryptjs";

const projectId = "demo-cpm";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const testPassword = process.env.R05_TEST_PASSWORD;

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
if (!process.env.FIREBASE_SERVICE_KEY) {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  process.env.FIREBASE_SERVICE_KEY = JSON.stringify({
    project_id: projectId,
    client_email: "r05-emulator@demo-cpm.invalid",
    private_key: privateKey
  });
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
if (serviceAccount.project_id !== projectId) {
  throw new Error(`Expected project_id ${projectId}.`);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId
});

const db = admin.firestore();
const command = process.argv[2] || "seed";

function serialize(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serialize(entry)])
    );
  }
  return value;
}

if (command === "seed") {
  if (!testPassword) {
    throw new Error("R05_TEST_PASSWORD is required for seed.");
  }

  const [sessions, rateLimits] = await Promise.all([
    db.collection("sessions").get(),
    db.collection("rate_limits").get()
  ]);
  const batch = db.batch();
  for (const doc of sessions.docs) batch.delete(doc.ref);
  for (const doc of rateLimits.docs) batch.delete(doc.ref);

  const adminPasswordHash = await bcrypt.hash(testPassword, 12);
  const bobPasswordHash = await bcrypt.hash(testPassword, 12);
  batch.set(db.collection("users").doc("ADMINU"), {
    username: "ADMINU",
    role: "ADMIN",
    passwordHash: adminPasswordHash,
    isBanned: false
  });
  batch.set(db.collection("users").doc("BOB"), {
    username: "BOB",
    role: "USER",
    passwordHash: bobPasswordHash,
    isBanned: false
  });
  batch.set(db.collection("settings").doc("filters"), { words: [] });
  batch.set(db.collection("pinned").doc("current"), {
    active: false,
    chatLocked: false,
    raidMode: false
  });
  batch.set(db.collection("posts").doc("test-post"), {
    userId: "BOB",
    name: "BOB",
    message: "R-05 seeded post",
    createdAt: admin.firestore.Timestamp.now(),
    likes: 0,
    isShadowbanned: false
  });
  await batch.commit();
  console.log(JSON.stringify({
    projectId,
    emulatorHost,
    seeded: ["users/ADMINU", "users/BOB", "settings/filters", "pinned/current", "posts/test-post"],
    passwordFormat: "bcrypt passwordHash",
    sessionsCleared: sessions.size,
    rateLimitsCleared: rateLimits.size
  }, null, 2));
} else if (command === "seed-session") {
  const sid = process.argv[3];
  const username = process.argv[4];
  if (!sid || !username) {
    throw new Error("Usage: seed-session <sid> <username>");
  }
  await db.collection("sessions").doc(sid).set({
    username,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ),
    device: "Desktop",
    browser: "Browser",
    os: "Unknown OS",
    active: true
  });
  console.log(JSON.stringify({ seededSession: `sessions/${sid}`, username }));
} else if (command === "dump-session") {
  const sid = process.argv[3];
  if (!sid) throw new Error("Usage: dump-session <sid>");
  const snap = await db.collection("sessions").doc(sid).get();
  console.log(JSON.stringify({
    id: sid,
    exists: snap.exists,
    data: snap.exists ? serialize(snap.data()) : null
  }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}

await admin.app().delete();
