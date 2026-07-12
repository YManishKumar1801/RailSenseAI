import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAG8JWWAGi9sBKkDqwbVt6K3k-bGUUBfMg",
  authDomain: "railsenseai.firebaseapp.com",
  projectId: "railsenseai",
  storageBucket: "railsenseai.firebasestorage.app",
  messagingSenderId: "831626741691",
  appId: "1:831626741691:web:028b2415d07b114c6e269e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
  auth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
};