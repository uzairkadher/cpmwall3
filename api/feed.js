import admin from 'firebase-admin';
function initFirebase(){
  if(!admin.apps.length){
    let sk=null; try{ if(process.env.FIREBASE_SERVICE_KEY){ sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY); if(sk?.private_key) sk.private_key=sk.private_key.replace(/\\n/g,'\n'); } }catch(e){}
    if(sk) admin.initializeApp({credential: admin.credential.cert(sk)}); else admin.initializeApp();
  }
  return admin.firestore();
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const db = initFirebase();
    const snap = await db.collection('posts').orderBy('createdAtNum','desc').limit(50).get();
    const posts = snap.docs.map(d=>({id:d.id,...d.data()}));
    return res.json(posts.reverse());
  }catch(e){ return res.status(500).json({error:e.message}); }
}