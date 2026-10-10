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

    // --- BOT NOW RUNS BEFORE REPLY ---
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const lower = message.toLowerCase();
    if(GEMINI_KEY && (lower.includes('@apex') || lower.includes('apex_racer') || lower.includes('?') || lower.includes('#'))){
      try{
        const prompt = `You are Apex_Racer, a pro Car Parking Multiplayer player from Pakistan. Reply in short funny English/Urdu mix, max 18 words. Player ${name} said: "${message}". If they ask tune, give short tune. If they ask room code, say join fast. Be friendly.`;
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,{
          method:'POST',
          headers:{'Content-Type':'application/json','x-goog-api-key': GEMINI_KEY.trim()},
          body: JSON.stringify({contents:[{parts:[{text: prompt}]}]})
        });
        const j = await r.json();
        const reply = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0,150);
        if(reply){
          await db.collection('posts').add({
            name:'Apex_Racer',
            message: reply,
            isBot:true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAtNum: Date.now()+1000
          });
        }
      }catch(e){ console.log('Bot error', e.message); }
    }

    res.json({ok:true});

  }catch(e){ res.status(500).json({error:e.message}); }
}