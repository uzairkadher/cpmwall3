import admin from 'firebase-admin';
let sk=null; try{if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY);}catch(e){}
if(!admin.apps.length) admin.initializeApp({credential: admin.credential.cert(sk)});
const db=admin.firestore();
export default async function handler(req,res){
 if(req.method!=='GET') return res.status(405).end();
 try{
   const snap=await db.collection('posts').orderBy('createdAt','desc').limit(80).get();
   const posts=snap.docs.map(d=>({id:d.id, name:d.data().name, message:d.data().message, isBot:d.data().isBot||false, createdAt:d.data().createdAt?.toMillis()||Date.now()}));
   res.setHeader('Cache-Control','no-store');
   res.json({posts});
 }catch(e){ res.status(500).json({error:e.message, posts:[]}); }
}