import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  DEMO_DISPLAY_NAME,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  clearAuth,
  ensureEmulatorUser,
  getEmulatorAuth,
} from '@/test/emulator';

describe('Firebase Auth emulator', () => {
  beforeAll(async () => {
    await clearAuth();
    await ensureEmulatorUser();
  });

  afterAll(async () => {
    await signOut(getEmulatorAuth());
  });

  it('signs in the demo account against the real Auth emulator', async () => {
    const auth = getEmulatorAuth();

    const credential = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);

    expect(credential.user.email).toBe(DEMO_EMAIL);
    expect(credential.user.displayName).toBe(DEMO_DISPLAY_NAME);
    expect(auth.currentUser?.uid).toBe(credential.user.uid);
  });
});
