import admin from 'firebase-admin';
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY)) });
}
const db = admin.firestore();
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.headers['x-admin-key']!== process.env.ADMIN_SECRET) {
    return res.status(401).send('Unauthorized');
  }
  if (req.method === 'GET') {
    const logsSnap = await db.collection('ip_logs').orderBy('createdAt', 'desc').limit(100).get();
    const posts = logsSnap.docs.map(d => ({ id: d.id,...d.data() }));
    const pinnedDoc = await db.collection('pinned').doc('current').get();
    const pinned = pinnedDoc.exists? pinnedDoc.data() : null;
    return res.json({ posts, pinned });
  }
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id || typeof id!== 'string') return res.status(400).send('Missing id');
    const batch = db.batch();
    batch.delete(db.collection('posts').doc(id));
    batch.delete(db.collection('ip_logs').doc(id));
    await batch.commit();
    return res.json({ ok: true });
  }
  if (req.method === 'POST') {
    const { action, ip, id, name, message, text } = req.body;
    if (action === 'ban' && ip && ip!== 'BOT' && ip!== 'N/A' && ip!== 'ADMIN') {
      const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, '_');
      const batch = db.batch();
      batch.set(db.collection('banned').doc(safeIp), { ip, bannedAt: admin.firestore.FieldValue.serverTimestamp() });
      if (id && typeof id === 'string') { batch.delete(db.collection('posts').doc(id)); batch.delete(db.collection('ip_logs').doc(id)); }
      await batch.commit();
      return res.json({ ok: true, banned: ip });
    }
    if (action === 'verify' && id) {
      const batch = db.batch();
      batch.update(db.collection('posts').doc(id), { isVerified: true });
      batch.update(db.collection('ip_logs').doc(id), { isVerified: true });
      await batch.commit();
      return res.json({ ok: true, verified: id });
    }
    if (action === 'set_pinned') {
      if (!text || typeof text!== 'string') return res.status(400).send('Missing text');
      await db.collection('pinned').doc('current').set({
        text: text.trim(), name: (name || 'Admin').trim(), active: true, updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ ok: true });
    }
    if (action === 'clear_pinned') {
      await db.collection('pinned').doc('current').set({ active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return res.json({ ok: true });
    }
    if (action === 'admin_post') {
      if (!name ||!message) return res.status(400).send('Missing fields');
      if (name.length > 25 || message.length > 150) return res.status(400).send('Too long');
      const postRef = db.collection('posts').doc();
      const batch = db.batch();
      batch.set(postRef, { name: name.trim(), message: message.trim(), isVerified: true, isAdmin: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      batch.set(db.collection('ip_logs').doc(postRef.id), { postId: postRef.id, name: name.trim(), message: message.trim(), ip: 'ADMIN', isVerified: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await batch.commit();
      return res.json({ ok: true });
    }
    return res.status(400).send('Invalid action');
  }
  return res.status(405).end();
}