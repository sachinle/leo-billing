import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app            = initializeApp(firebaseConfig);
const auth           = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ── Email Allowlist ───────────────────────────────────────────────────────────
export const ALLOWED_EMAILS = [
  "sachinimmanuel2006@gmail.com",
  "sachinannie172@gmail.com",
  "sanjayantonio4@gmail.com",
  "apptest123@gmail.com"
];
export const isAllowed = (email) => ALLOWED_EMAILS.includes(email);
// ─────────────────────────────────────────────────────────────────────────────

const isNative = () =>
  typeof window !== "undefined" &&
  !!window.Capacitor?.isNativePlatform?.();

async function denyAccess() {
  try {
    if (isNative()) {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      await FirebaseAuthentication.signOut();
    }
    await signOut(auth);
  } catch (_) {}
  const err = new Error("ACCESS_DENIED");
  err.code = "ACCESS_DENIED";
  throw err;
}

export const signInWithGoogle = async () => {
  try {
    if (isNative()) {
      const { FirebaseAuthentication } = await import(
        "@capacitor-firebase/authentication"
      );
      const nativeResult = await FirebaseAuthentication.signInWithGoogle();

      // Check BEFORE signInWithCredential so onAuthStateChanged never fires
      if (!isAllowed(nativeResult.user?.email)) await denyAccess();

      const idToken = nativeResult.credential?.idToken;
      if (!idToken) throw new Error("No idToken returned from native Google Sign-In");

      const credential = GoogleAuthProvider.credential(idToken);
      const result     = await signInWithCredential(auth, credential);
      return result.user;

    } else {
      const result = await signInWithPopup(auth, googleProvider);
      if (!isAllowed(result.user?.email)) await denyAccess();
      return result.user;
    }
  } catch (error) {
    if (
      error?.code === "SIGN_IN_CANCELLED" ||
      error?.message?.includes("SIGN_IN_CANCELLED") ||
      error?.code === "auth/popup-closed-by-user"
    ) return null;
    throw error;
  }
};

export const signUpWithEmail = async (email, password) => {
  if (!isAllowed(email)) await denyAccess();
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const signInWithEmail = async (email, password) => {
  if (!isAllowed(email)) await denyAccess();
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

export const logout = async () => {
  try {
    if (isNative()) {
      try {
        const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
        await FirebaseAuthentication.signOut();
      } catch (_) {}
    }
    await signOut(auth);
  } catch (error) { throw error; }
};

export { auth };