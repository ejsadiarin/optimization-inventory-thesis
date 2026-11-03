import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FolderPlus } from 'lucide-react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title, description, and action', () => {
    render(
      <EmptyState
        icon={FolderPlus}
        title="No projects yet"
        description="Create your first project to start planning cuts."
        action={<button type="button">New Project</button>}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'No projects yet' })).toBeInTheDocument();
    expect(screen.getByText('Create your first project to start planning cuts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument();
  });

  it('renders without optional content and hides the icon from assistive technology', () => {
    const { container } = render(<EmptyState icon={FolderPlus} title="Nothing here" />);

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
