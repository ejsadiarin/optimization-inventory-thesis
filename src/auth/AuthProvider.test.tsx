import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './AuthProvider';
import { TestAuthProvider, testUser } from '@/test/auth';

function renderProtected(props: {
  user?: typeof testUser | null;
  loading?: boolean;
}) {
  return render(
    <TestAuthProvider {...props}>
      <MemoryRouter initialEntries={['/projects/abc']}>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/projects/:projectId" element={<div>Private project</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  );
}

describe('RequireAuth', () => {
  it('shows a full-screen loader while auth resolves', () => {
    renderProtected({ loading: true });

    expect(screen.getByRole('status')).toHaveTextContent(/checking sign-in/i);
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
    expect(screen.queryByText('Private project')).not.toBeInTheDocument();
  });

  it('redirects signed-out visitors to the login screen', () => {
    renderProtected({ user: null });

    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Private project')).not.toBeInTheDocument();
  });

  it('renders the protected route for a signed-in account', () => {
    renderProtected({ user: testUser });

    expect(screen.getByText('Private project')).toBeInTheDocument();
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
  });
});
