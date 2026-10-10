import admin from 'firebase-admin';
let sk=null; 
try{ if(process.env.FIREBASE_SERVICE_KEY) sk=JSON.parse(process.env.FIREBASE_SERVICE_KEY); }catch(e){}
if(!admin.apps.length){
  admin.initializeApp({credential: admin.credential.cert(sk)});
}
const db=admin.firestore();

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  try{
    const snap = await db.collection('posts').limit(100).get();
    let posts = snap.docs.map(d=>{
      const data=d.data();
      return {
        id: d.id,
        name: data.name||'Anonymous',
        message: data.message||'',
        isBot: data.isBot||false,
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
      };
    });
    // Sort in JS, not Firebase (so no index needed)
    posts.sort((a,b)=> b.createdAt - a.createdAt);
    res.json({posts: posts.slice(0,80)});
  }catch(e){
    res.status(500).json({error: e.message, posts: []});
  }
}