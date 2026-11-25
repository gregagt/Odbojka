import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAhMsqfId2xEfy8-rv5m7Z3jn6w8JzY4TU",
  authDomain: "odbojka-8f5e3.firebaseapp.com",
  projectId: "odbojka-8f5e3",
  storageBucket: "odbojka-8f5e3.firebasestorage.app",
  messagingSenderId: "491970544806",
  appId: "1:491970544806:web:eb90b471bf08b809c66067"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);