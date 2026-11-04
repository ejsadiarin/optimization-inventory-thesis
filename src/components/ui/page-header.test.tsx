import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title, description, and actions', () => {
    render(
      <PageHeader
        title="Inventory"
        description="Track every phenolic board and lumber piece."
        actions={<button type="button">Add piece</button>}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About Inventory' })).toBeInTheDocument();
    expect(screen.getByText('Track every phenolic board and lumber piece.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add piece' })).toBeInTheDocument();
  });

  it('omits optional sections when they are not provided', () => {
    render(<PageHeader title="Summary" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Summary' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
