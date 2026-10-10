import admin from 'firebase-admin';
let sk=null; try{if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY);}catch(e){}
if(!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sk)});
const db=admin.firestore();

export default async function handler(req,res){
 if(req.method!=='POST') return res.status(405).end();
 try{
   let {name,message}=req.body||{};
   name=(name||'').trim().slice(0,25); message=(message||'').trim().slice(0,150);
   if(!name||!message||name.length<2) return res.status(400).send('Invalid');

   // Save instantly - NO WAITING
   const docRef = await db.collection('posts').add({
     name, message,
     createdAt: admin.firestore.FieldValue.serverTimestamp()
   });

   // Save log in background, don't wait
   db.collection('ip_logs').doc(docRef.id).set({
     ip: (req.headers['x-forwarded-for']||'').split(',')[0],
     name, message,
     createdAt: admin.firestore.FieldValue.serverTimestamp()
   }).catch(()=>{});

   // Instant response
   res.json({ok:true, id: docRef.id});

   // Bot reply later in background (don't make user wait)
   const GEMINI_KEY=process.env.GEMINI_API_KEY;
   if(GEMINI_KEY && /@apex|bot|\?/i.test(message)){
     fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,{
       method:'POST', headers:{'Content-Type':'application/json'},
       body: JSON.stringify({contents:[{parts:[{text:`You are Apex_Racer, CPM player, reply short <20 words to ${name}: "${message}"`}]}]})
     }).then(r=>r.json()).then(d=>{
       const reply=d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0,150);
       if(reply) db.collection('posts').add({name:'Apex_Racer',message:reply,createdAt:admin.firestore.FieldValue.serverTimestamp(),isBot:true});
     }).catch(()=>{});
   }

 }catch(e){ res.status(500).send(e.message); }
}