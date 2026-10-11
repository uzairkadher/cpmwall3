import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY))
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const adminKey = req.headers["x-admin-key"] || req.query.key;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const action = req.query.action || "posts";
      if (action === "posts") {
        const snap = await db.collection("posts").orderBy("createdAt", "desc").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "quota") {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);

        const [postsToday, visitorsToday] = await Promise.all([
          db.collection("posts").where("createdAt", ">=", startTimestamp).count().get(),
          db.collection("visitors").where("lastSeen", ">=", startTimestamp).count().get()
        ]);

        const writesToday = (postsToday.data().count * 2) + visitorsToday.data().count;
        const estimatedReads = (visitorsToday.data().count * 105) + (postsToday.data().count * 3);

        return res.status(200).json({
          reads: estimatedReads,
          readLimit: 50000,
          writes: writesToday,
          writeLimit: 20000,
          deletes: 0,
          deleteLimit: 20000,
          lastReset: startOfDay.toISOString()
        });
      }
      if (action === "vip_members") {
        const snap = await db.collection("vip_members").orderBy("unlockedAt", "desc").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "vip_banned") {
        const snap = await db.collection("vip_banned").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "banned") {
        const snap = await db.collection("banned").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "subnet_bans") {
        const snap = await db.collection("subnet_bans").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "subnet_whitelist") {
        const snap = await db.collection("subnet_whitelist").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "fingerprint_bans") {
        const snap = await db.collection("fingerprint_bans").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "shadowbanned") {
        const snap = await db.collection("shadowbanned").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "verified_ips") {
        const snap = await db.collection("verified_ips").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "logs") {
        const snap = await db.collection("ip_logs").orderBy("createdAt", "desc").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "visitors") {
        const snap = await db.collection("visitors").orderBy("lastSeen", "desc").limit(60).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "pinned") {
        const snap = await db.collection("pinned").doc("current").get();
        return res.status(200).json(snap.exists ? snap.data() : null);
      }
      if (action === "filters") {
        const doc = await db.collection("settings").doc("filters").get();
        return res.status(200).json({ words: doc.exists ? (doc.data().words || []) : [] });
      }
      if (action === "payments") {
        const snap = await db.collection("payments").orderBy("createdAt", "desc").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (action === "notes") {
        const snap = await db.collection("ip_notes").limit(200).get();
        const notesObj = {};
        snap.forEach(d => { notesObj[d.id] = d.data().note; });
        return res.status(200).json(notesObj);
      }
      if (action === "strikes") {
        const snap = await db.collection("strikes").limit(100).get();
        return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Missing id" });
      await db.collection("posts").doc(id).delete();
      await db.collection("ip_logs").doc(id).delete().catch(() => {});
      return res.status(200).json({ success: true });
    }

    if (req.method === "POST") {
      const { action } = req.body;

      if (action === "toggle_chat_lock") {
        const { locked } = req.body;
        await db.collection("pinned").doc("current").set({
          chatLocked: Boolean(locked)
        }, { merge: true });
        return res.status(200).json({ success: true, chatLocked: Boolean(locked) });
      }

      if (action === "whitelist_subnet_ip") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("subnet_whitelist").doc(safeIp).set({
          ip,
          whitelistedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true, ip });
      }

      if (action === "remove_subnet_whitelist") {
        const { ip } = req.body;
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("subnet_whitelist").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "delete_bulk") {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "No ids provided" });
        const batch = db.batch();
        ids.forEach(id => {
          batch.delete(db.collection("posts").doc(id));
          batch.delete(db.collection("ip_logs").doc(id));
        });
        await batch.commit();
        return res.status(200).json({ success: true, count: ids.length });
      }

      if (action === "toggle_raid_mode") {
        const { raidMode } = req.body;
        await db.collection("pinned").doc("current").set({
          raidMode: Boolean(raidMode)
        }, { merge: true });
        return res.status(200).json({ success: true, raidMode: Boolean(raidMode) });
      }

      if (action === "ban_subnet") {
        const { subnet } = req.body;
        if (!subnet) return res.status(400).json({ error: "Subnet required" });
        const docId = subnet.replace(/\*/g, '0');
        await db.collection("subnet_bans").doc(docId).set({
          subnet,
          bannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true, subnet });
      }

      if (action === "unban_subnet") {
        const { subnet } = req.body;
        const docId = subnet.replace(/\*/g, '0');
        await db.collection("subnet_bans").doc(docId).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "ban_fingerprint") {
        const { fingerprint } = req.body;
        if (!fingerprint) return res.status(400).json({ error: "Fingerprint required" });
        await db.collection("fingerprint_bans").doc(fingerprint).set({
          fingerprint,
          bannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === "unban_fingerprint") {
        const { fingerprint } = req.body;
        await db.collection("fingerprint_bans").doc(fingerprint).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "shadowban") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("shadowbanned").doc(safeIp).set({
          ip,
          shadowbannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === "unshadowban") {
        const { ip } = req.body;
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("shadowbanned").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "save_note") {
        const { ip, note } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("ip_notes").doc(safeIp).set({
          ip,
          note: String(note || "").trim(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === "generate_vip_code") {
        const rand = Math.floor(1000 + Math.random() * 9000);
        const code = `CPM-${rand}`;
        await db.collection("pinned").doc("current").set({
          vipKey: code
        }, { merge: true });
        return res.status(200).json({ success: true, vipKey: code });
      }

      if (action === "set_slow_mode") {
        const seconds = Math.max(1, Math.min(60, Number(req.body.seconds) || 10));
        await db.collection("pinned").doc("current").set({
          slowModeSeconds: seconds
        }, { merge: true });
        return res.status(200).json({ success: true, slowModeSeconds: seconds });
      }

      if (action === "edit_post") {
        const { postId, message } = req.body;
        if (!postId || !message) return res.status(400).json({ error: "Missing postId or message" });
        const cleanMsg = String(message).trim().substring(0, 250);
        await db.collection("posts").doc(postId).update({ message: cleanMsg });
        await db.collection("ip_logs").doc(postId).update({ message: cleanMsg }).catch(() => {});
        return res.status(200).json({ success: true, message: cleanMsg });
      }

      if (action === "flush_lobby") {
        const count = Math.min(100, Math.max(10, Number(req.body.count) || 50));
        const snap = await db.collection("posts").orderBy("createdAt", "desc").limit(count).get();
        const batch = db.batch();
        snap.forEach(d => {
          batch.delete(d.ref);
          batch.delete(db.collection("ip_logs").doc(d.id));
        });
        await batch.commit();
        return res.status(200).json({ success: true, deleted: snap.size });
      }

      if (action === "save_payment") {
        const { driverTag, method, amount, txId, notes } = req.body;
        if (!driverTag || !amount) return res.status(400).json({ error: "Driver Tag and Amount required" });
        await db.collection("payments").add({
          driverTag: String(driverTag).trim(),
          method: method || "JazzCash",
          amount: Number(amount) || 0,
          txId: String(txId || "N/A").trim(),
          notes: String(notes || "").trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === "delete_payment") {
        const { paymentId } = req.body;
        await db.collection("payments").doc(paymentId).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "ban") {
        const { ip, reason, hours } = req.body;
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        let bannedUntil = null;
        if (hours && Number(hours) > 0) {
          bannedUntil = admin.firestore.Timestamp.fromMillis(Date.now() + Number(hours) * 3600 * 1000);
        }
        await db.collection("banned").doc(safeIp).set({
          ip,
          reason: reason || "spam",
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          bannedUntil
        });
        return res.status(200).json({ success: true });
      }

      if (action === "unban") {
        const safeIp = req.body.ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("banned").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "purge_ip") {
        const { ip } = req.body;
        const logsSnap = await db.collection("ip_logs").where("ip", "==", ip).get();
        const batch = db.batch();
        logsSnap.forEach(d => {
          const lData = d.data();
          if (lData.postId) batch.delete(db.collection("posts").doc(lData.postId));
          batch.delete(d.ref);
        });
        await batch.commit();
        return res.status(200).json({ success: true, count: logsSnap.size });
      }

      if (action === "dismiss_report") {
        await db.collection("posts").doc(req.body.postId).update({ isReported: false, reportCount: 0 });
        return res.status(200).json({ success: true });
      }

      if (action === "add_filter") {
        await db.collection("settings").doc("filters").set({
          words: admin.firestore.FieldValue.arrayUnion(req.body.word.trim().toLowerCase())
        }, { merge: true });
        return res.status(200).json({ success: true });
      }

      if (action === "remove_filter") {
        await db.collection("settings").doc("filters").update({
          words: admin.firestore.FieldValue.arrayRemove(req.body.word.trim().toLowerCase())
        });
        return res.status(200).json({ success: true });
      }

      if (action === "verify_ip") {
        const safeIp = req.body.ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("verified_ips").doc(safeIp).set({
          ip: req.body.ip,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === "unverify_ip") {
        const safeIp = req.body.ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("verified_ips").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "pin") {
        const { text, name, active } = req.body;
        await db.collection("pinned").doc("current").set({
          text: (text || "").substring(0, 200),
          name: name || "Admin",
          active: Boolean(active),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return res.status(200).json({ success: true });
      }
    }
    return res.status(400).json({ error: "Invalid action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
