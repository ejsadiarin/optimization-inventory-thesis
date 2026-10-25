import { normalizeAccessCode } from '@/lib/ids';

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
}

export async function hashAccessCode(code: string, salt: string): Promise<string> {
  const codeBytes = encoder.encode(normalizeAccessCode(code));
  const saltBytes = hexToBytes(salt);
  const input = new Uint8Array(saltBytes.length + codeBytes.length);
  input.set(saltBytes);
  input.set(codeBytes, saltBytes.length);

  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
}

export function generateAccessCodeSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

export async function verifyAccessCode(
  code: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await hashAccessCode(code, salt);
  const expected = expectedHash.toLowerCase();
  if (actual.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
