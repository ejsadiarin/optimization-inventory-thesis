import { describe, expect, it } from 'vitest';

describe('firebase client without configuration', () => {
  it('reports an unconfigured app without creating Firebase services', async () => {
    const firebase = await import('./firebase');

    expect(firebase.firebaseConfigured).toBe(false);
    expect(firebase.firebaseApp).toBeNull();
    expect(firebase.auth).toBeNull();
    expect(firebase.db).toBeNull();
  });
});
