import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  signInAnonymously,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  setPersistence,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

export const auth = getAuth(firebaseApp);

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function createEmailPasswordAccount(email: string, password: string): Promise<void> {
  await setPersistence(auth, browserLocalPersistence);
  await createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function continueAsGuest(): Promise<void> {
  await setPersistence(auth, browserLocalPersistence);
  await signInAnonymously(auth);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');
  return user.getIdToken();
}
