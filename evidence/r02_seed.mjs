import { createHash, generateKeyPairSync } from "node:crypto";
import admin from "firebase-admin";

const projectId = "demo-cpm";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
process.env.FIREBASE_SERVICE_KEY ||= JSON.stringify({
  project_id: projectId,
  client_email: "r02-emulator@demo-cpm.invalid",
  private_key: privateKey
});

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

if (command === "seed") {
  const batch = db.batch();
  batch.set(db.collection("users").doc("ADMINU"), {
    role: "ADMIN",
    isBanned: false
  });
  batch.set(db.collection("users").doc("BOB"), {
    role: "USER",
    ip: "203.0.113.7",
    isBanned: false
  });
  batch.set(db.collection("users").doc("CAROL"), {
    role: "USER",
    isBanned: false
  });
  batch.set(db.collection("posts").doc("test-post"), {
    userId: "CAROL",
    name: "CAROL",
    message: "Seeded post for R-02 like test",
    createdAt: admin.firestore.Timestamp.now(),
    likes: 0,
    isShadowbanned: false
  });
  batch.set(db.collection("settings").doc("filters"), { words: [] });
  batch.set(db.collection("pinned").doc("current"), {
    active: false,
    chatLocked: false,
    raidMode: false
  });
  await batch.commit();
  console.log(JSON.stringify({
    projectId,
    emulatorHost,
    seeded: ["users/ADMINU", "users/BOB", "users/CAROL", "posts/test-post", "settings/filters", "pinned/current"]
  }, null, 2));
} else if (command === "reset-rate") {
  const ip = process.argv[3];
  if (!ip) throw new Error("Usage: reset-rate <ip>");
  const key = createHash("sha256").update(ip).digest("hex");
  await db.collection("rate_limits").doc(key).delete();
  console.log(JSON.stringify({ deletedRateLimitForIp: ip, key }));
} else if (command === "expire-bob") {
  const banKey = createHash("sha256").update("203.0.113.7").digest("hex");
  await db.collection("users").doc("BOB").update({
    isBanned: true,
    bannedUntil: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000)
    )
  });
  await db.collection("banned").doc(banKey).delete();
  console.log(JSON.stringify({
    user: "BOB",
    isBanned: true,
    bannedUntil: "one hour in the past",
    deletedBanDocumentId: banKey
  }, null, 2));
} else if (command === "dump-banned") {
  const snapshot = await db.collection("banned").get();
  console.log(JSON.stringify(snapshot.docs.map(doc => ({
    id: doc.id,
    ip: doc.data().ip,
    username: doc.data().username
  })), null, 2));
} else if (command === "dump-bob") {
  const snapshot = await db.collection("users").doc("BOB").get();
  const data = snapshot.data() || {};
  console.log(JSON.stringify({
    exists: snapshot.exists,
    isBanned: data.isBanned,
    bannedUntil: data.bannedUntil?.toDate?.().toISOString() || null
  }, null, 2));
} else if (command === "dump-fingerprints") {
  const snapshot = await db.collection("fingerprint_bans").get();
  console.log(JSON.stringify({
    count: snapshot.size,
    ids: snapshot.docs.map(doc => doc.id)
  }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}

await admin.app().delete();
