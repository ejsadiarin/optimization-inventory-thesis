import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = 'demo@example.com';
const password = 'demo1234';
const displayName = 'Demo Engineer';
const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-test';

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);

try {
  const existing = await auth.getUserByEmail(email);
  console.log(`Demo user already exists: ${existing.email} (${existing.uid})`);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  const created = await auth.createUser({ email, password, displayName });
  console.log(`Created demo user: ${created.email} (${created.uid})`);
}
