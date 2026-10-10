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

    const docRef = await db.collection('posts').add({
      name, message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtNum: Date.now()
    });

    // INSTANT REPLY TO USER
    res.json({ok:true});

    // --- AI BOT IN BACKGROUND (does not slow posting) ---
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if(!GEMINI_KEY) return; // if key not set, stop

    const shouldReply = message.toLowerCase().includes('@apex') || message.toLowerCase().includes('apex_racer') || message.includes('?');
    if(!shouldReply) return;

    try{
      const prompt = `You are Apex_Racer, a pro Car Parking Multiplayer player from Pakistan. Reply in short funny English/Urdu mix, max 18 words. Player ${name} said: "${message}". If they ask tune, give short tune. If they ask room code, say join fast. Be friendly.`;

      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
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

  }catch(e){ res.status(500).json({error:e.message}); }
}