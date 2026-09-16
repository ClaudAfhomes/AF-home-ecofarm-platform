import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Spinner } from './Spinner.js';

describe('Spinner', () => {
  it('is decorative by default (aria-hidden)', () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('exposes a status live region when labelled', () => {
    render(<Spinner label="Loading policies" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading policies');
  });

  it('renders size classes', () => {
    const { container } = render(<Spinner size="lg" />);
    expect(container.firstElementChild?.className).toMatch(/lg/);
  });
});
