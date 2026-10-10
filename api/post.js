import admin from 'firebase-admin';
let sk=null;
try{ if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY); }catch(e){}
if(!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sk)});
const db=admin.firestore();

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='POST') return res.status(405).end();
  try{
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    let name=(body.name||'').toString().trim().slice(0,25);
    let message=(body.message||'').toString().trim().slice(0,150);
    if(!name ||!message) return res.status(400).json({error:'Invalid'});

    await db.collection('posts').add({
      name, message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtNum: Date.now()
    });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const lower = message.toLowerCase();

    if(lower.includes('@apex') || lower.includes('apex_racer')){
      let botMsg = '';
      if(!GEMINI_KEY){
        botMsg = 'Error: GEMINI_API_KEY not set in Vercel! Add it bro.';
      } else {
        try{
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,{
            method:'POST',
            headers:{'Content-Type':'application/json','x-goog-api-key': GEMINI_KEY.trim()},
            body: JSON.stringify({contents:[{parts:[{text:`You are Apex_Racer, pro CPM player from Pakistan. Reply short funny mix Urdu English max 15 words to: ${message}`}]}]})
          });
          const j = await r.json();
          if(j.error){ botMsg = `Gemini Error: ${j.error.message}`; }
          else { botMsg = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0,150) || 'Gemini gave empty reply'; }
        }catch(e){ botMsg = `Bot crashed: ${e.message}`; }
      }
      await db.collection('posts').add({
        name:'Apex_Racer', message: botMsg, isBot:true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtNum: Date.now()+1000
      });
    }

    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
}