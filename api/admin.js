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
  res.setHeader('Access-Control-Allow-Methods','DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='DELETE') return res.status(405).json({error:'Method Not Allowed'});
  const {id, pass} = req.query;
  const pwd = process.env.ADMIN_PASSWORD || 'cpm123';
  if(pass!==pwd) return res.status(403).json({error:'Invalid password'});
  try{ const db=initFirebase(); await db.collection('posts').doc(id).delete(); return res.json({ok:true}); }
  catch(e){ return res.status(500).json({error:e.message}); }
}