import admin from 'firebase-admin';
let sk=null; try{if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY);}catch(e){}
if(!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sk)});
const db=admin.firestore();
export default async function handler(req,res){
 const ADMIN_KEY=process.env.ADMIN_KEY;
 const incomingKey=req.headers['x-admin-key'] || req.query.key || req.body?.key;
 if(incomingKey!== ADMIN_KEY) return res.status(401).json({error:'Unauthorized - Wrong ADMIN_KEY'});
 if(req.method==='GET'){
   const posts=(await db.collection('posts').orderBy('createdAt','desc').limit(100).get()).docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis()}));
   const logs=(await db.collection('ip_logs').orderBy('createdAt','desc').limit(100).get()).docs.map(d=>d.data());
   return res.json({posts,logs});
 }
 if(req.method==='DELETE'){
   const {id,ip}=req.body||req.query||{};
   if(id){ await db.collection('posts').doc(id).delete(); return res.json({ok:true}); }
   if(ip){ const safeIp=ip.replace(/[^a-zA-Z0-9.:]/g,'_'); await db.collection('banned').doc(safeIp).set({ip,bannedAt:admin.firestore.FieldValue.serverTimestamp()}); return res.json({ok:true}); }
   return res.status(400).json({error:'Need id or ip'});
 }
 res.status(405).end();
}