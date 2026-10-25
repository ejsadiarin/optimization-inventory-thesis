import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginScreen from './LoginScreen';
import { TestAuthProvider, testUser } from '@/test/auth';

const firebaseMock = vi.hoisted(() => ({
  firebaseConfigured: true,
  auth: { name: 'mock-auth' },
}));
const signInMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => firebaseMock);
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: signInMock,
  onAuthStateChanged: vi.fn(),
}));

function renderLogin(options: {
  user?: typeof testUser | null;
  from?: { pathname: string; search?: string; hash?: string };
} = {}) {
  const state = options.from ? { from: options.from } : undefined;
  return render(
    <TestAuthProvider user={options.user ?? null}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/" element={<div>Project marketplace</div>} />
          <Route path="/projects/:projectId" element={<div>Requested project</div>} />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  );
}

beforeEach(() => {
  firebaseMock.firebaseConfigured = true;
  signInMock.mockReset();
});

afterEach(() => {
  firebaseMock.firebaseConfigured = true;
});

describe('LoginScreen', () => {
  it('signs in and redirects to the marketplace', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValueOnce({});
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Project marketplace')).toBeInTheDocument();
    expect(signInMock).toHaveBeenCalledWith(firebaseMock.auth, 'demo@example.com', 'demo1234');
  });

  it('returns to the deep link requested before sign-in', async () => {
    const user = userEvent.setup();
    signInMock.mockResolvedValueOnce({});
    renderLogin({ from: { pathname: '/projects/abc', search: '?tab=members' } });

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Requested project')).toBeInTheDocument();
  });

  it('shows a clear error for invalid credentials', async () => {
    const user = userEvent.setup();
    signInMock.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /incorrect email or password/i,
    );
  });

  it('distinguishes an emulator or network failure from bad credentials', async () => {
    const user = userEvent.setup();
    signInMock.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'demo@example.com');
    await user.type(screen.getByLabelText(/password/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not reach the authentication server/i,
    );
  });

  it('fills the demo credentials from the hint', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /use demo account/i }));

    expect(screen.getByLabelText(/email/i)).toHaveValue('demo@example.com');
    expect(screen.getByLabelText(/password/i)).toHaveValue('demo1234');
  });

  it('redirects an already signed-in account to the marketplace', () => {
    renderLogin({ user: testUser });

    expect(screen.getByText('Project marketplace')).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('keeps the deep link when the account is already signed in', () => {
    renderLogin({ user: testUser, from: { pathname: '/projects/abc' } });

    expect(screen.getByText('Requested project')).toBeInTheDocument();
  });

  it('shows the unconfigured state instead of crashing', () => {
    firebaseMock.firebaseConfigured = false;
    renderLogin();

    expect(screen.getByRole('alert')).toHaveTextContent(/firebase is not configured/i);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled();
  });
});
