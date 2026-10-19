# Architectural Blueprint: cpmwall3.vercel.app

## 1. Project Overview
* **Project Name:** CPM Community Wall v3.5 (Empire Studio)
* **Domain:** `https://cpmwall3.vercel.app/` (Primary CORS and Vercel configuration domain)
* **Tech Stack:** Vercel Serverless Functions (Node.js), Firebase Firestore (NoSQL), Vanilla HTML5/JS/CSS3 SPA, Tailwind CSS (Design System).
* **Architecture:** Stateless serverless middleware acting as a secure gateway to a locked-down Firestore database. Real-time client updates via `onSnapshot` WebSockets.

## 2. Firebase Configuration & Schema

### Firebase Configuration
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAOE8v7ANE6vvlHh2ZbiaJ6iHBN4voFcYM",
  authDomain: "cpmwall3.firebaseapp.com",
  projectId: "cpmwall3"
};
