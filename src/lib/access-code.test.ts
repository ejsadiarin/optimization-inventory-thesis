import { describe, expect, it } from 'vitest';
import { generateAccessCodeSalt, hashAccessCode, verifyAccessCode } from './access-code';

const SALT = '00112233445566778899aabbccddeeff';

describe('access codes', () => {
  it('normalizes case and surrounding whitespace before hashing', async () => {
    await expect(hashAccessCode('  demo01 ', SALT)).resolves.toBe(
      await hashAccessCode('DEMO01', SALT),
    );
  });

  it('produces a stable lowercase SHA-256 hex digest', async () => {
    const hash = await hashAccessCode('DEMO01', SALT);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAccessCode('DEMO01', SALT)).toBe(hash);
  });

  it('changes when the salt changes', async () => {
    const otherSalt = generateAccessCodeSalt();

    await expect(hashAccessCode('DEMO01', SALT)).resolves.not.toBe(
      await hashAccessCode('DEMO01', otherSalt),
    );
  });

  it('accepts the right code and rejects the wrong code', async () => {
    const hash = await hashAccessCode('DEMO01', SALT);

    await expect(verifyAccessCode('demo01', SALT, hash)).resolves.toBe(true);
    await expect(verifyAccessCode('WRONG1', SALT, hash)).resolves.toBe(false);
  });

  it('generates 16-byte hex salts', () => {
    const salt = generateAccessCodeSalt();

    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(generateAccessCodeSalt()).not.toBe(salt);
  });
});
