import admin from 'firebase-admin';
let sk=null; try{if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY);}catch(e){}
if(!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sk)});
const db=admin.firestore();
export default async function handler(req,res){
 if(req.method!=='POST') return res.status(405).end();
 try{
   const realIp=(req.headers['x-real-ip']||(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'unknown').slice(0,45);
   const safeIp=realIp.replace(/[^a-zA-Z0-9.:]/g,'_');
   if((await db.collection('banned').doc(safeIp).get()).exists) return res.status(403).send('Banned');
   const rateRef=db.collection('rateLimits').doc(safeIp);
   const rateDoc=await rateRef.get();
   if(rateDoc.exists && Date.now()-(rateDoc.data().lastPost?.toMillis()||0) < 15000) return res.status(429).send('Wait 15 sec');
   let {name,message}=req.body||{};
   if(typeof name!=='string'||typeof message!=='string') return res.status(400).send('Invalid');
   name=name.trim(); message=message.trim();
   if(!name||!message||name.length>25||message.length>150||name.length<2) return res.status(400).send('Invalid length');
   if(/^(apex_racer|admin)$/i.test(name)) return res.status(400).send('Reserved');
   if(/(https?:\/\/|www\.|\.com|\.gg|t\.me|discord)/i.test(message)) return res.status(400).send('No links');
   const postRef=db.collection('posts').doc();
   const batch=db.batch();
   batch.set(postRef,{name,message,createdAt:admin.firestore.FieldValue.serverTimestamp()});
   batch.set(db.collection('ip_logs').doc(postRef.id),{postId:postRef.id,name,message,ip:realIp,createdAt:admin.firestore.FieldValue.serverTimestamp()});
   batch.set(rateRef,{lastPost:admin.firestore.FieldValue.serverTimestamp(),ip:realIp},{merge:true});
   await batch.commit();
   res.json({ok:true});
   const GEMINI_KEY=process.env.GEMINI_API_KEY;
   if(GEMINI_KEY && (/@(apex|bot)/i.test(message)||message.includes('?')||/tune|gearbox|help/i.test(message))){
     try{
       const prompt=`You are Apex_Racer, CPM player, casual short <25 words. User ${name}: "${message}". Reply as Apex_Racer.`;
       const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]}),signal:AbortSignal.timeout(4000)});
       const d=await r.json(); const reply=d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0,150);
       if(reply) await db.collection('posts').doc().set({name:'Apex_Racer',message:reply,createdAt:admin.firestore.FieldValue.serverTimestamp(),isBot:true});
     }catch(e){}
   }
 }catch(err){ if(!res.headersSent) res.status(500).send(err.message); }
}