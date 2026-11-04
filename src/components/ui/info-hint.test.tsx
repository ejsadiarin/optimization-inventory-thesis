import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoHint } from './info-hint';

describe('InfoHint', () => {
  it('exposes the hint as the info button description while open', async () => {
    const user = userEvent.setup();
    render(
      <InfoHint label="Inventory">
        Track every phenolic board and lumber piece across its lifecycle.
      </InfoHint>,
    );

    const button = screen.getByRole('button', { name: 'About Inventory' });
    const description = screen.getByRole('tooltip');

    expect(button).not.toHaveAttribute('aria-describedby');
    await user.click(button);
    expect(button).toHaveAttribute('aria-describedby', description.id);
    expect(description).toHaveTextContent(
      'Track every phenolic board and lumber piece across its lifecycle.',
    );
  });

  it('opens on hover, focus, or tap and dismisses with Escape', async () => {
    const user = userEvent.setup();
    render(<InfoHint label="Inventory">Inventory help</InfoHint>);

    const button = screen.getByRole('button', { name: 'About Inventory' });
    const tooltip = screen.getByRole('tooltip');

    expect(tooltip).toHaveClass('opacity-0');
    await user.hover(button);
    expect(tooltip).toHaveClass('opacity-100');
    await user.unhover(button);
    expect(tooltip).toHaveClass('opacity-0');

    await user.click(button);
    expect(tooltip).toHaveClass('opacity-100');
    await user.keyboard('{Escape}');
    expect(tooltip).toHaveClass('opacity-0');
  });
});
