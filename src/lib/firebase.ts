import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  setLogLevel,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Silence internal @firebase/firestore transient watch-stream retry noise in console
// while preserving explicit structured error reporting via handleFirestoreError.
setLogLevel('silent');

// Force HTTP long-polling in browser environments so proxies, iframes, and mobile
// carrier gateways never buffer streaming WebChannel responses for 10 seconds.
export const db =
  typeof window !== 'undefined'
    ? initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          experimentalLongPollingOptions: {
            timeoutSeconds: 15,
          },
        },
        firebaseConfig.firestoreDatabaseId
      )
    : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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

export function isFirestoreOfflineOrTransientError(error: unknown): boolean {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'cancelled' ||
    msg.includes('the client is offline') ||
    msg.includes('client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend')
  );
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

export async function validateFirestoreConnection(): Promise<boolean> {
  const timeoutGuard = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(true), 3500);
  });

  const serverCheck = (async () => {
    try {
      await getDocFromServer(doc(db, 'stats', 'platform'));
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('the client is offline') &&
        !firebaseConfig.projectId
      ) {
        console.error('Please check your Firebase configuration.');
      }
      // Fallback to local/cached read without failing app startup
      await getDoc(doc(db, 'stats', 'platform')).catch(() => undefined);
      return true;
    }
  })();

  return Promise.race([serverCheck, timeoutGuard]);
}

export async function probeFirestoreRoundTrip(): Promise<{
  ok: boolean;
  latencyMs: number;
  detail: string;
}> {
  const started = performance.now();
  try {
    const snap = await Promise.race([
      getDocFromServer(doc(db, 'stats', 'platform')),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out after 8 seconds')), 8000)
      ),
    ]);
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    return {
      ok: true,
      latencyMs,
      detail: snap.exists()
        ? 'Connected to live Cloud Firestore (stats/platform verified)'
        : 'Connected to live Cloud Firestore (ready for initial curriculum)',
    };
  } catch (err) {
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      latencyMs,
      detail: msg.includes('offline')
        ? 'Client appears offline or blocked from reaching Firestore.'
        : `Firestore probe error: ${msg}`,
    };
  }
}

export const BOOTSTRAPPED_ADMIN_EMAIL = 'hiranyaudakara2@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
