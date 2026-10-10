import admin from 'firebase-admin';

let serviceKey = null;
try { 
  if(process.env.FIREBASE_SERVICE_KEY) {
    serviceKey = JSON.parse(process.env.FIREBASE_SERVICE_KEY); 
  }
} catch(e){ console.log("Key parse error"); }

if(!admin.apps.length){
  admin.initializeApp({ credential: admin.credential.cert(serviceKey) });
}
const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let body = req.body;
    if (typeof body === 'string') { try{ body = JSON.parse(body); } catch{ body={}; } }
    
    let name = (body.name||'').toString().trim().slice(0,25);
    let message = (body.message||'').toString().trim().slice(0,150);
    if(!name || !message) return res.status(400).json({error:'Invalid'});

    // 1. Save user message
    await db.collection('posts').add({
      name, message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtNum: Date.now()
    });

    // 2. BOT - FIXED MODEL
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const lower = message.toLowerCase();
    
    if(lower.includes('@apex') || lower.includes('apex_racer')){
      let botReply = '';
      if(!GEMINI_KEY){
        botReply = 'Error: GEMINI_API_KEY not set in Vercel';
      } else {
        try{
          // FIXED: gemini-2.5-flash (2.0 is retired)
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,{
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'x-goog-api-key': GEMINI_KEY.trim() // FIXED for AQ. keys
            },
            body: JSON.stringify({
              contents:[{ parts:[{ text:`You are Apex_Racer, pro CPM player from Pakistan. Reply short funny Urdu/English mix max 20 words. Player ${name} said: ${message}` }]}]
            })
          });
          const j = await r.json();
          if(j.error) botReply = `Gemini Error: ${j.error.message}`;
          else botReply = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0,150) || 'Pit lane busy try again!';
        } catch(e){ botReply = `Bot crash: ${e.message}`; }
      }
      await db.collection('posts').add({
        name:'Apex_Racer 🤖', message: botReply, isBot:true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtNum: Date.now()+1000
      });
    }

    res.json({ok:true});
  } catch(e){
    res.status(500).json({error:e.message});
  }
}