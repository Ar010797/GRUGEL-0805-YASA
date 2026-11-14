import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'ar01071997@gmail.com';
export const WEBVIEW_AUTH_ERROR = 'WEBVIEW_OAUTH_BLOCKED';

export function isEmbeddedWebView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const win = window as unknown as Record<string, unknown>;
  if (win.median || win.gonative) {
    return true;
  }
  const ua = navigator.userAgent || '';
  if (/\bwv\b/i.test(ua) || /Android.*Version\/[\d.]+/i.test(ua)) {
    return true;
  }
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) {
    return true;
  }
  return false;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export async function signInWithGoogleCloud(): Promise<User | null> {
  if (isEmbeddedWebView()) {
    throw new Error(WEBVIEW_AUTH_ERROR);
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (
      code.includes('popup-blocked') ||
      code.includes('operation-not-supported') ||
      code.includes('cancelled-popup-request') ||
      msg.includes('disallowed_useragent')
    ) {
      throw new Error(WEBVIEW_AUTH_ERROR);
    }
    throw err;
  }
}

export async function obtainGoogleOAuthTokensForPairing(): Promise<{
  idToken: string | null;
  accessToken: string | null;
  email: string | null;
}> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken || null;
  const accessToken = credential?.accessToken || null;

  if (!idToken && !accessToken) {
    throw new Error('Gagal memperoleh token OAuth Google dari Chrome.');
  }

  return {
    idToken,
    accessToken,
    email: result.user?.email || null,
  };
}

export async function signInToFirebaseWithOAuthTokens(
  idToken?: string | null,
  accessToken?: string | null
): Promise<User> {
  if (!idToken && !accessToken) {
    throw new Error('Token OAuth Google tidak tersedia untuk login Firebase.');
  }
  const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signOutGoogleCloud(): Promise<void> {
  await signOut(auth);
}
