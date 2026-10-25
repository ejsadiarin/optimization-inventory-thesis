import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';

export const EMULATOR_PROJECT_ID = 'demo-test';
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_DISPLAY_NAME = 'Demo Engineer';

const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = 8080;
const FAKE_API_KEY = 'demo-test-api-key';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

function getEmulatorApp(): FirebaseApp {
  app ??= initializeApp(
    {
      apiKey: FAKE_API_KEY,
      authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
      projectId: EMULATOR_PROJECT_ID,
      appId: '1:demo-test:web:emulator',
    },
    'emulator-tests',
  );
  return app;
}

export function getEmulatorAuth(): Auth {
  if (!auth) {
    auth = getAuth(getEmulatorApp());
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }
  return auth;
}

export function getEmulatorDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getEmulatorApp());
    connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return firestore;
}

async function expectOk(response: Response, action: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${action} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function flushPendingWrites(): Promise<void> {
  const { db } = await import('@/lib/firebase');
  if (db) {
    await waitForPendingWrites(db);
  }
}

export async function clearAuth(): Promise<void> {
  const response = await fetch(
    `${AUTH_EMULATOR_URL}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Clearing Auth emulator failed with ${response.status}`);
  }
}

export async function clearFirestore(): Promise<void> {
  const response = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Clearing Firestore emulator failed with ${response.status}`);
  }
}

interface EmulatorUserInput {
  email: string;
  password: string;
  displayName: string;
}

export async function ensureEmulatorUser(
  user: EmulatorUserInput = {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    displayName: DEMO_DISPLAY_NAME,
  },
): Promise<string> {
  const signUp = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        returnSecureToken: true,
      }),
    },
  );

  let body = (await signUp.json()) as {
    localId?: string;
    idToken?: string;
    error?: { message?: string };
  };

  if (!signUp.ok) {
    if (body.error?.message !== 'EMAIL_EXISTS') {
      throw new Error(`Creating emulator user failed: ${body.error?.message ?? signUp.status}`);
    }

    const signIn = await fetch(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FAKE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          returnSecureToken: true,
        }),
      },
    );
    body = (await expectOk(signIn, 'Signing in the emulator user')) as typeof body;
  }

  if (!body.idToken) {
    throw new Error('Auth emulator did not return an id token');
  }

  await expectOk(
    await fetch(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:update?key=${FAKE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: body.idToken,
          displayName: user.displayName,
          returnSecureToken: true,
        }),
      },
    ),
    'Updating the emulator user display name',
  );

  if (!body.localId) {
    throw new Error('Auth emulator did not return a user id');
  }
  return body.localId;
}

export async function signInDemoUser(): Promise<string> {
  await ensureEmulatorUser();
  const { auth: globalAuth } = await import('@/lib/firebase');
  if (!globalAuth) {
    throw new Error('The global Firebase auth instance is not configured.');
  }
  const credential = await signInWithEmailAndPassword(globalAuth, DEMO_EMAIL, DEMO_PASSWORD);
  return credential.user.uid;
}

export async function signOutDemoUser(): Promise<void> {
  const { auth: globalAuth } = await import('@/lib/firebase');
  if (globalAuth) {
    await signOut(globalAuth);
  }
}
