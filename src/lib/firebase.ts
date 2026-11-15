import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  inMemoryPersistence,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

export interface ResolvedFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function readViteEnv(key: string): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      return typeof val === 'string' ? val.trim() : '';
    }
  } catch {
    // ignore env lookup issues
  }
  return '';
}

export const firebaseConfig: ResolvedFirebaseConfig = {
  projectId: readViteEnv('VITE_FIREBASE_PROJECT_ID') || firebaseConfigJson.projectId,
  appId: readViteEnv('VITE_FIREBASE_APP_ID') || firebaseConfigJson.appId,
  apiKey: readViteEnv('VITE_FIREBASE_API_KEY') || firebaseConfigJson.apiKey,
  authDomain: readViteEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseConfigJson.authDomain,
  firestoreDatabaseId:
    readViteEnv('VITE_FIREBASE_DATABASE_ID') ||
    firebaseConfigJson.firestoreDatabaseId ||
    '(default)',
  storageBucket:
    readViteEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseConfigJson.storageBucket,
  messagingSenderId:
    readViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseConfigJson.messagingSenderId,
};

const PRIMARY_APP_NAME = '[DEFAULT]';
const SECONDARY_APP_NAME = 'kaswarga-provisioner';

const app: FirebaseApp = getApps().some((a) => a.name === PRIMARY_APP_NAME)
  ? getApp(PRIMARY_APP_NAME)
  : initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
    });

export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth: Auth = getAuth(app);

// Ensure auth sessions persist across reloads, Vercel SPA navigation, and Median WebView restarts
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Firebase Auth persistence fallback:', err);
  });
}

let secondaryAuthInstance: Auth | null = null;

export async function getSecondaryAuth(): Promise<Auth> {
  if (secondaryAuthInstance) return secondaryAuthInstance;
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  const secApp =
    existing ||
    initializeApp(
      {
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId,
      },
      SECONDARY_APP_NAME
    );
  const secAuth = getAuth(secApp);
  await setPersistence(secAuth, inMemoryPersistence).catch(() => {});
  secondaryAuthInstance = secAuth;
  return secAuth;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FirebaseConnectionDiagnostic {
  connected: boolean;
  latencyMs: number;
  projectId: string;
  databaseId: string;
  authDomain: string;
  message: string;
  errorDetail?: string;
}

export async function testFirestoreConnection(): Promise<FirebaseConnectionDiagnostic> {
  const started = Date.now();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    const latencyMs = Date.now() - started;
    return {
      connected: true,
      latencyMs,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      authDomain: firebaseConfig.authDomain,
      message: `Terhubung ke Cloud Firestore (${firebaseConfig.projectId}) • ${latencyMs} ms`,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - started;
    const msg = String(error?.message || '');
    const code = String(error?.code || '');

    // Signed-out users receive permission-denied from /test/connection rule — that proves Firestore server is online!
    if (
      code === 'permission-denied' ||
      /missing or insufficient permissions/i.test(msg)
    ) {
      return {
        connected: true,
        latencyMs,
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId,
        authDomain: firebaseConfig.authDomain,
        message: `Terhubung ke Cloud Firestore (${firebaseConfig.projectId}) • ${latencyMs} ms`,
      };
    }

    const isOffline =
      code === 'unavailable' ||
      msg.includes('the client is offline') ||
      /network|failed to fetch|offline/i.test(msg);

    if (isOffline) {
      console.error('Please check your Firebase configuration.', error);
    }

    return {
      connected: false,
      latencyMs,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      authDomain: firebaseConfig.authDomain,
      message: isOffline
        ? `Perangkat sedang offline atau Cloud Firestore (${firebaseConfig.projectId}) tidak terjangkau.`
        : `Gagal menguji koneksi Cloud Firestore: ${msg || code}`,
      errorDetail: msg || code,
    };
  }
}

// Run startup connectivity probe as required by Firebase SDK pattern
if (typeof window !== 'undefined') {
  testFirestoreConnection().catch(() => {});
}
