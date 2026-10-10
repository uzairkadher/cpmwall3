import admin from 'firebase-admin';

function initFirebase() {
  if (!admin.apps.length) {
    let serviceKey = null;
    try {
      if (process.env.FIREBASE_SERVICE_KEY) {
        serviceKey = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
        if (serviceKey?.private_key) serviceKey.private_key = serviceKey.private_key.replace(/\\n/g, '\n');
      }
    } catch(e){ console.error(e.message); }
    if (serviceKey) admin.initializeApp({ credential: admin.credential.cert(serviceKey) });
    else admin.initializeApp();
  }
  return admin.firestore();
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method Not Allowed'});
  try{
    const db = initFirebase();
    let body = req.body; if(typeof body==='string'){ try{body=JSON.parse(body)}catch{body={}} }
    const name = (body.name||'').toString().trim().slice(0,25);
    const message = (body.message||'').toString().trim().slice(0,150);
    if(!name ||!message) return res.status(400).json({error:'Required'});
    const ts = Date.now();
    await db.collection('posts').add({ name, message, createdAt: admin.firestore.FieldValue.serverTimestamp(), createdAtNum: ts });

    const KEY = process.env.GEMINI_API_KEY;
    if(KEY && message.toLowerCase().includes('@apex')){
      try{
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-goog-api-key':KEY.trim()},
          body: JSON.stringify({ contents:[{ parts:[{ text:`You are Apex_Racer, CPM expert from Pakistan. Reply short funny Urdu/English max 20 words. Player ${name}: "${message}". If tune, give gear ratios.` }]}] })
        });
        const j = await r.json();
        let reply = j?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0,200);
        if(j.error) reply = `Gemini Error: ${j.error.message}`;
        if(reply) await db.collection('posts').add({ name:'Apex_Racer 🤖', message:reply, isBot:true, createdAt: admin.firestore.FieldValue.serverTimestamp(), createdAtNum: ts+500 });
      }catch(e){ console.log(e.message); }
    }
    return res.json({ok:true});
  }catch(e){ return res.status(500).json({error:e.message}); }
}