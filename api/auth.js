import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY))
  });
}

const db = admin.firestore();

// Blueprint reserved usernames + user-requested 'SYSTEM'
const RESERVED_HANDLES = ["ADMIN", "MOD", "SYSTEM", "OWNER", "VIP", "CPM"];

function signJwt(payload) {
  const secret = process.env.JWT_SECRET || "default_jwt_secret_fallback_key";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 24 * 3600 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${data}`).digest("base64url");
  return `${header}.${data}.${signature}`;
}

export function verifyJwt(token) {
  try {
    const secret = process.env.JWT_SECRET || "default_jwt_secret_fallback_key";
    const [header, data, signature] = token.split(".");
    if (!header || !data || !signature) return null;
    
    const expectedSig = crypto.createHmac("sha256", secret).update(`${header}.${data}`).digest("base64url");
    if (signature !== expectedSig) return null;
    
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString());
    if (parsed.exp && parsed.exp < Date.now()) return null;
    
    return parsed;
  } catch {
    return null;
  }
}

function hashPasswordWithSalt(password) {
  return crypto.createHash("sha256").update(password + "cpm_salt_2025").digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const action = req.query.action;

  try {
    if (req.method === "GET" && action === "me") {
      const authHeader = req.headers["authorization"] || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
      if (!token) return res.status(401).json({ error: "Missing token" });

      const decoded = verifyJwt(token);
      if (!decoded || !decoded.username) return res.status(401).json({ error: "Invalid token" });

      return res.status(200).json({ username: decoded.username });
    }

    if (req.method === "POST") {
      const { username, password, confirmPassword } = req.body || {};
      
      // Enforce Blueprint uppercase normalization
      const cleanUser = String(username || "").toUpperCase().trim();

      if (action === "register") {
        if (!/^[A-Z0-9_.]{3,20}$/.test(cleanUser)) {
          return res.status(400).json({ error: "Invalid username format (3-20 chars: A-Z, 0-9, _, .)" });
        }

        if (RESERVED_HANDLES.includes(cleanUser)) {
          return res.status(400).json({ error: "This username is reserved and cannot be registered." });
        }

        if (!password || password.length < 6) {
          return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        if (password !== confirmPassword) {
          return res.status(400).json({ error: "Passwords do not match" });
        }

        const userRef = db.collection("users").doc(cleanUser);
        const docSnap = await userRef.get();
        if (docSnap.exists) {
          return res.status(400).json({ error: "Username taken" });
        }

        // Apply Blueprint SHA-256 + cpm_salt_2025 hashing
        const passHash = hashPasswordWithSalt(password);
        const rawIp = (req.headers['x-forwarded-for'] || "").split(',')[0].trim() || "unknown";

        await userRef.set({
          username: cleanUser,
          passHash,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ip: rawIp
        });

        const token = signJwt({ username: cleanUser });
        return res.status(200).json({ token, username: cleanUser });
      }

      if (action === "login") {
        if (!cleanUser || !password) {
          return res.status(400).json({ error: "Username and password required" });
        }

        const userRef = db.collection("users").doc(cleanUser);
        let docSnap = await userRef.get();
        let needsMigration = false;
        let legacyRef = null;

        // Auto-migration check: If uppercase doc doesn't exist, look for legacy lowercase
        if (!docSnap.exists) {
          const legacyUser = cleanUser.toLowerCase();
          legacyRef = db.collection("users").doc(legacyUser);
          docSnap = await legacyRef.get();
          
          if (!docSnap.exists) {
            return res.status(401).json({ error: "User not found" });
          }
          needsMigration = true;
        }

        const userData = docSnap.data();
        let match = false;

        // Verify password against whichever hash exists
        if (userData.passHash) {
          match = (hashPasswordWithSalt(password) === userData.passHash);
        } else if (userData.passwordHash) {
          match = await bcrypt.compare(password, userData.passwordHash);
        }

        if (!match) {
          return res.status(401).json({ error: "Wrong password" });
        }

        // Perform migration if legacy account logged in successfully
        if (needsMigration && legacyRef) {
          const batch = db.batch();
          const newPassHash = hashPasswordWithSalt(password);
          
          const migratedData = {
            ...userData,
            username: cleanUser,
            passHash: newPassHash,
            migratedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          // Remove old bcrypt hash from the new document
          delete migratedData.passwordHash;

          batch.set(userRef, migratedData);
          batch.delete(legacyRef);
          await batch.commit();
        }

        // Issue JWT for the uppercase Blueprint-standard username
        const token = signJwt({ username: cleanUser });
        return res.status(200).json({ token, username: cleanUser });
      }
    }

    return res.status(400).json({ error: "Invalid auth action" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
