import { describe, expect, it, vi } from 'vitest';

describe('firebase client without configuration', () => {
  it('reports an unconfigured app without creating Firebase services', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'false');
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', '');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');

    const firebase = await import('./firebase');

    expect(firebase.firebaseConfigured).toBe(false);
    expect(firebase.firebaseApp).toBeNull();
    expect(firebase.auth).toBeNull();
    expect(firebase.db).toBeNull();
  });
});

