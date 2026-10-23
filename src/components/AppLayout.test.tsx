import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './AppLayout';
import { TestAuthProvider, testUser } from '@/test/auth';

const firebaseMock = vi.hoisted(() => ({
  firebaseConfigured: true,
  auth: { name: 'mock-auth' },
}));
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => firebaseMock);
vi.mock('firebase/auth', () => ({
  signOut: signOutMock,
  onAuthStateChanged: vi.fn(),
}));

function renderLayout(user = testUser) {
  return render(
    <TestAuthProvider user={user}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<div>Project marketplace</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  );
}

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
});

describe('AppLayout', () => {
  it('shows the signed-in display name and signs out', async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getByText('Demo Engineer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOutMock).toHaveBeenCalledWith(firebaseMock.auth);
  });

  it('falls back to the email when there is no display name', () => {
    renderLayout({ ...testUser, displayName: '' });

    expect(screen.getByText('demo@example.com')).toBeInTheDocument();
  });
});
