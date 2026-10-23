import { afterAll, describe, expect, it, vi } from 'vitest';
import { terminate, type Firestore } from 'firebase/firestore';

const CONFIG = {
  VITE_FIREBASE_API_KEY: 'fake-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-test',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-test.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
};

let firestore: Firestore | null = null;

afterAll(async () => {
  if (firestore) await terminate(firestore);
});

describe('firebase client with configuration', () => {
  it('initializes auth and Firestore when all env values are present', async () => {
    for (const [key, value] of Object.entries(CONFIG)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'false');

    const firebase = await import('./firebase');
    firestore = firebase.db;

    expect(firebase.firebaseConfigured).toBe(true);
    expect(firebase.firebaseApp).not.toBeNull();
    expect(firebase.auth).not.toBeNull();
    expect(firebase.db).not.toBeNull();
  });
});
