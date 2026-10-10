import admin from 'firebase-admin';
let sk=null;
try{ if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY); }catch(e){}
if(!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sk)});
const db=admin.firestore();

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='POST') return res.status(405).end();
  try{
    let body='';
    if(req.body && typeof req.body==='object'){ body=req.body; }
    else { try{ body=JSON.parse(req.body||'{}'); }catch{ body={}; } }
    
    let name=(body.name||'').toString().trim().slice(0,25);
    let message=(body.message||'').toString().trim().slice(0,150);
    
    if(!name || name.length<2) return res.status(400).json({error:'Name too short'});
    if(!message) return res.status(400).json({error:'Empty message'});

    const doc = await db.collection('posts').add({
      name, message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtNum: Date.now()
    });

    res.json({ok:true, id: doc.id});

  }catch(e){ res.status(500).json({error: e.message}); }
}