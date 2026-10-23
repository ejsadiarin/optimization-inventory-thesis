import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const REQUIRED_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const env = import.meta.env;
const APP_NAME = 'formwork-optimizer';

function hasValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const firebaseConfigured = REQUIRED_ENV_KEYS.every((key) => hasValue(env[key]));

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp: FirebaseApp | null = firebaseConfigured
  ? (getApps().find((app) => app.name === APP_NAME) ?? initializeApp(firebaseConfig, APP_NAME))
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

function createFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db: Firestore | null = firebaseApp ? createFirestore(firebaseApp) : null;

const EMULATOR_FLAG = '__formworkFirebaseEmulatorsConnected';
const emulatorState = globalThis as typeof globalThis & { [EMULATOR_FLAG]?: boolean };

if (auth && db && env.VITE_USE_FIREBASE_EMULATOR === 'true' && !emulatorState[EMULATOR_FLAG]) {
  emulatorState[EMULATOR_FLAG] = true;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
