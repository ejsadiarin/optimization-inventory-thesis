import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoHint } from './info-hint';

describe('InfoHint', () => {
  it('exposes the hint as the info button description', () => {
    render(
      <InfoHint label="Inventory">
        Track every phenolic board and lumber piece across its lifecycle.
      </InfoHint>,
    );

    const button = screen.getByRole('button', { name: 'About Inventory' });
    const description = screen.getByRole('tooltip');

    expect(button).toHaveAttribute('aria-describedby', description.id);
    expect(description).toHaveTextContent(
      'Track every phenolic board and lumber piece across its lifecycle.',
    );
  });
});
