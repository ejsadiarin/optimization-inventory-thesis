import { afterAll, describe, expect, it, vi } from 'vitest';
import { terminate, type Firestore } from 'firebase/firestore';

let firestore: Firestore | null = null;

afterAll(async () => {
  if (firestore) await terminate(firestore);
});

describe('firebase client in emulator mode', () => {
  it('uses demo emulator defaults when credentials are blank', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'true');

    const firebase = await import('./firebase');
    firestore = firebase.db;

    expect(firebase.firebaseConfigured).toBe(true);
    expect(firebase.firebaseApp?.options.projectId).toBe('demo-test');
    expect(firebase.auth).not.toBeNull();
    expect(firebase.db).not.toBeNull();
  });
});
