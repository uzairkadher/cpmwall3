import { createHash, generateKeyPairSync } from "node:crypto";
import admin from "firebase-admin";
import bcrypt from "bcryptjs";

const projectId = "demo-cpm";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const testPassword = process.env.R04_TEST_PASSWORD;
const command = process.argv[2] || "seed";

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
if (!process.env.FIREBASE_SERVICE_KEY) {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  process.env.FIREBASE_SERVICE_KEY = JSON.stringify({
    project_id: projectId,
    client_email: "r04-emulator@demo-cpm.invalid",
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

async function clearCollection(name) {
  const snapshot = await db.collection(name).get();
  let batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400) await batch.commit();
  return count;
}

if (command === "seed") {
  if (!testPassword) {
    throw new Error("R04_TEST_PASSWORD is required for seed.");
  }

  const cleared = {};
  for (const name of [
    "posts",
    "sessions",
    "rate_limits",
    "ip_logs",
    "shadowbanned",
    "banned",
    "fingerprint_bans",
    "subnet_bans",
    "subnet_whitelist"
  ]) {
    cleared[name] = await clearCollection(name);
  }

  const [passwordHash] = await Promise.all([
    bcrypt.hash(testPassword, 12),
    db.collection("settings").doc("filters").set({ words: [] }),
    db.collection("pinned").doc("current").set({
      active: false,
      chatLocked: false,
      raidMode: false,
      slowModeSeconds: 10
    })
  ]);
  const now = Date.now();
  const batch = db.batch();
  for (const username of ["BOB", "EVE"]) {
    batch.set(db.collection("users").doc(username), {
      username,
      role: "USER",
      passwordHash,
      isBanned: false,
      isVerified: false,
      isVip: false
    });
  }
  batch.set(db.collection("posts").doc("p1"), {
    name: "BOB",
    userId: "BOB",
    message: "Visible post by BOB",
    createdAt: admin.firestore.Timestamp.fromMillis(now - 60000),
    isShadowbanned: false,
    likes: 4,
    room: "public"
  });
  batch.set(db.collection("posts").doc("p2"), {
    name: "EVE",
    userId: "EVE",
    message: "Shadowbanned post by EVE",
    createdAt: admin.firestore.Timestamp.fromMillis(now - 120000),
    isShadowbanned: true,
    likes: 2,
    room: "public"
  });
  batch.set(db.collection("posts").doc("p3"), {
    name: "BOB",
    userId: "BOB",
    message: "Legacy post without a shadowban field",
    createdAt: admin.firestore.Timestamp.fromMillis(now - 180000),
    likes: 1,
    room: "public"
  });
  await batch.commit();
  console.log(JSON.stringify({
    projectId,
    emulatorHost,
    seeded: ["users/BOB", "users/EVE", "posts/p1", "posts/p2", "posts/p3"],
    post3HasShadowbanField: false,
    passwordFormat: "bcrypt passwordHash",
    cleared
  }, null, 2));
} else if (command === "seed-shadowban") {
  const ip = process.argv[3];
  if (!ip) throw new Error("Usage: seed-shadowban <ip>");
  const id = createHash("sha256").update(ip).digest("hex");
  await db.collection("shadowbanned").doc(id).set({
    ip,
    username: "EVE",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(JSON.stringify({ collection: "shadowbanned", id, ip, username: "EVE" }));
} else if (command === "clear-rate-limits") {
  console.log(JSON.stringify({ clearedRateLimits: await clearCollection("rate_limits") }));
} else {
  throw new Error(`Unknown command: ${command}`);
}

await admin.app().delete();
