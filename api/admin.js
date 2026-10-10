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
        const words = doc.exists ? (doc.data().words || []) : [];
        return res.status(200).json({ words });
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

      if (action === "set_vip_key") {
        const { vipKey } = req.body;
        await db.collection("pinned").doc("current").set({
          vipKey: String(vipKey || "VIP777").trim()
        }, { merge: true });
        return res.status(200).json({ success: true, vipKey: String(vipKey || "VIP777").trim() });
      }

      if (action === "ban_vip") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        const batch = db.batch();
        batch.set(db.collection("vip_banned").doc(safeIp), {
          ip,
          bannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        batch.delete(db.collection("vip_members").doc(safeIp));
        await batch.commit();
        return res.status(200).json({ success: true });
      }

      if (action === "unban_vip") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("vip_banned").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "toggle_chat_lock") {
        const { locked } = req.body;
        await db.collection("pinned").doc("current").set({
          chatLocked: Boolean(locked)
        }, { merge: true });
        return res.status(200).json({ success: true, chatLocked: Boolean(locked) });
      }

      if (action === "ban") {
        const { ip, reason, hours } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
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
        const { ip } = req.body;
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("banned").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "purge_ip") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const logsSnap = await db.collection("ip_logs").where("ip", "==", ip).get();
        const batch = db.batch();
        logsSnap.forEach(d => {
          const lData = d.data();
          if (lData.postId) {
            batch.delete(db.collection("posts").doc(lData.postId));
          }
          batch.delete(d.ref);
        });
        await batch.commit();
        return res.status(200).json({ success: true, count: logsSnap.size });
      }

      if (action === "dismiss_report") {
        const { postId } = req.body;
        if (!postId) return res.status(400).json({ error: "Missing postId" });
        await db.collection("posts").doc(postId).update({ isReported: false, reportCount: 0 });
        return res.status(200).json({ success: true });
      }

      if (action === "add_filter") {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "Word required" });
        await db.collection("settings").doc("filters").set({
          words: admin.firestore.FieldValue.arrayUnion(word.trim().toLowerCase())
        }, { merge: true });
        return res.status(200).json({ success: true });
      }

      if (action === "remove_filter") {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "Word required" });
        await db.collection("settings").doc("filters").update({
          words: admin.firestore.FieldValue.arrayRemove(word.trim().toLowerCase())
        });
        return res.status(200).json({ success: true });
      }

      if (action === "verify_ip") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("verified_ips").doc(safeIp).set({
          ip,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === "unverify_ip") {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "Missing IP" });
        const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
        await db.collection("verified_ips").doc(safeIp).delete();
        return res.status(200).json({ success: true });
      }

      if (action === "verify") {
        const { postId, isVerified } = req.body;
        await db.collection("posts").doc(postId).update({ isVerified: Boolean(isVerified) });
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
