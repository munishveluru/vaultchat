/**
 * VaultChat — Firebase Google Authentication
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyBTVcW75_wfE87q5EDGaLpAD4XcD7MUjAA",
  authDomain: "vaultchat-a09cc.firebaseapp.com",
  projectId: "vaultchat-a09cc",
  storageBucket: "vaultchat-a09cc.firebasestorage.app",
  messagingSenderId: "306983849119",
  appId: "1:306983849119:web:de3eee630001505aaba6aa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.VaultAuth = {
  auth,

  async signInWithGoogle() {
    try {
      const result = await signInWithPopup(auth, provider);
      return {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL
      };
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  },

  async signOutUser() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  onAuthChange(callback) {
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        callback({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL
        });
      } else {
        callback(null);
      }
    });
  },

  getCurrentUser() {
    const user = auth.currentUser;
    if (user) {
      return {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL
      };
    }
    return null;
  }
};
