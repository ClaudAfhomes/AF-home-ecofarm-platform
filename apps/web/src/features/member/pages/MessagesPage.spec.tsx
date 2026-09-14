import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER, setMockSessionUser } from '@jad/mock';
import { createMemberMockServer } from '../../../mock';

import { MessagesPage } from './MessagesPage';
import { renderMember } from '../test/utils';

describe('member MessagesPage', () => {
  let server: ReturnType<typeof createMemberMockServer>;

  beforeEach(() => {
    server = createMemberMockServer();
    server.install();
    setMockSessionUser(MOCK_MEMBER);
  });

  afterEach(() => {
    server.restore();
    setMockSessionUser(null);
  });

  it('renders the admin thread oldest-first with the composer (FEAT-072)', async () => {
    renderMember(<MessagesPage />, { user: MOCK_MEMBER });

    // Seed thread: member message then staff reply (mem-001).
    expect(
      await screen.findByText('Hello, I have a question about my commission.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hi Juan! Happy to help — what would you like to know?')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/0\/4000/)).toBeInTheDocument();
  });

  it('sends a message and clears the composer', async () => {
    const user = userEvent.setup();
    renderMember(<MessagesPage />, { user: MOCK_MEMBER });

    await screen.findByText('Hello, I have a question about my commission.');

    const input = screen.getByLabelText('New message');
    await user.type(input, 'Thanks, that helps!');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(screen.getByText(/19\/4000/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('Thanks, that helps!')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});