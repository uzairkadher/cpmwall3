import admin from 'firebase-admin';
if(!admin.apps.length){ admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY)) }); }
const db=admin.firestore();
async function callAIBot(userName, userMessage, lastPostTime){
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if(!GEMINI_KEY) return null;
  const isMentioned = /@(apex|apex_racer|ai|bot)/i.test(userMessage);
  const shouldTriggerByKeyword = isMentioned || userMessage.includes('?') || /help|tune|gearbox|setup|car|best/i.test(userMessage);
  if(!shouldTriggerByKeyword){ if(lastPostTime && Date.now() - lastPostTime < 3*60*1000) return null; }
  try{
    const cleanMessage = userMessage.replace(/@(apex|apex_racer|ai|bot)/gi, '').trim() || 'yo';
    const prompt = `You are a casual Car Parking Multiplayer player in lobby chat. Username: Apex_Racer. Talk like a real gamer, short (under 25 words), casual slang, help with car setups, gearbox tunes, room codes. User ${userName} said: "${cleanMessage}". Reply as Apex_Racer, natural, friendly, no AI mention.`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if(!reply || reply.length > 200) return null;
    return reply.replace(/["*]/g,'').slice(0,150);
  }catch(e){ return null; }
}
export default async function handler(req,res){
 if (req.method === 'OPTIONS') return res.status(200).end();
 if(req.method!=='POST') return res.status(405).end();
 const realIp = (req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown').slice(0,45);
 const safeIp = realIp.replace(/[^a-zA-Z0-9.:]/g,'_');
 const bannedDoc = await db.collection('banned').doc(safeIp).get();
 if(bannedDoc.exists) return res.status(403).send('You are banned');
 const rateRef = db.collection('rateLimits').doc(safeIp);
 const rateDoc = await rateRef.get();
 if(rateDoc.exists){ const last = rateDoc.data().lastPost?.toMillis() || 0; if(Date.now() - last < 15000) return res.status(429).send('Cooldown - wait 15 sec'); }
 let { name, message } = req.body || {};
 if(typeof name!=='string' || typeof message!=='string') return res.status(400).send('Invalid type');
 name=name.trim(); message=message.trim();
 if(!name ||!message || name.length>25 || message.length>150 || name.length<2) return res.status(400).send('Invalid - name 2-25, msg max 150');
 if (/^(apex_racer|apex racer|cpm_bot|admin)$/i.test(name)) { return res.status(400).send('Name reserved.'); }
 const linkRegex = /(https?:\/\/|www\.|\.com|\.gg|\.ru|\.xyz|t\.me)/i;
 if(linkRegex.test(message) || linkRegex.test(name)) return res.status(400).send('Links not allowed.');
 const recentSnap = await db.collection('posts').orderBy('createdAt','desc').limit(1).get();
 const lastPostTime =!recentSnap.empty? (recentSnap.docs[0].data().createdAt?.toMillis() || 0) : 0;
 const postRef = db.collection('posts').doc();
 const batch = db.batch();
 batch.set(postRef, { name, message, createdAt: admin.firestore.FieldValue.serverTimestamp() });
 batch.set(db.collection('ip_logs').doc(postRef.id), { postId: postRef.id, name, message, ip: realIp, createdAt: admin.firestore.FieldValue.serverTimestamp() });
 batch.set(rateRef, { lastPost: admin.firestore.FieldValue.serverTimestamp(), ip: realIp }, { merge: true });
 await batch.commit();
 let botReply = null;
 try{ botReply = await callAIBot(name, message, lastPostTime); }catch(e){}
 if(botReply){
   const botRef = db.collection('posts').doc();
   await db.collection('posts').doc(botRef.id).set({ name: 'Apex_Racer', message: botReply, createdAt: admin.firestore.FieldValue.serverTimestamp(), isBot: true });
   await db.collection('ip_logs').doc(botRef.id).set({ postId: botRef.id, name: 'Apex_Racer', message: botReply, ip: 'BOT', createdAt: admin.firestore.FieldValue.serverTimestamp() });
 }
 res.json({ ok:true });
}