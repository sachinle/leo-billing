import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase'; // your existing web Firebase auth

const isNative = Capacitor.isNativePlatform();

export async function signInWithGoogle() {
  if (isNative) {
    const result = await FirebaseAuthentication.signInWithGoogle();
    return result.user;
  } else {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
}

export async function signInWithEmail(email, password) {
  if (isNative) {
    const result = await FirebaseAuthentication.signInWithEmailAndPassword({ email, password });
    return result.user;
  } else {
    return signInWithEmailAndPassword(auth, email, password);
  }
}

export async function signUpWithEmail(email, password) {
  if (isNative) {
    const result = await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password });
    return result.user;
  } else {
    return createUserWithEmailAndPassword(auth, email, password);
  }
}

export async function logout() {
  if (isNative) {
    await FirebaseAuthentication.signOut();
  } else {
    await signOut(auth);
  }
}

export async function resetPassword(email) {
  // Password reset is not available natively; fallback to web method.
  const { sendPasswordResetEmail } = await import('firebase/auth');
  return sendPasswordResetEmail(auth, email);
}