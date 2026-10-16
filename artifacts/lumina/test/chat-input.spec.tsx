import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '@/components/chat-input';

describe('ChatInput', () => {
  it('sends the trimmed message and clears the field', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const box = screen.getByTestId('input-chat-message');
    await user.type(box, '  hello there  ');
    await user.click(screen.getByTestId('button-send-message'));

    expect(onSend).toHaveBeenCalledWith('hello there', undefined);
    expect(box).toHaveValue('');
  });

  it('submits on Enter but not on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const box = screen.getByTestId('input-chat-message');
    await user.type(box, 'line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('line one', undefined);
  });

  it('cannot send while disabled', () => {
    render(<ChatInput onSend={vi.fn()} disabled />);
    expect(screen.getByTestId('button-send-message')).toBeDisabled();
    expect(screen.getByTestId('input-chat-message')).toBeDisabled();
  });

  // BUG-014: a send that never reached the API must not cost the user their
  // text — `onSend` resolves `true` to say so, and the composer restores it.
  it('restores the text when the send never reached the API', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} />);

    const box = screen.getByTestId('input-chat-message');
    await user.type(box, 'please keep me');
    await user.click(screen.getByTestId('button-send-message'));

    await waitFor(() => expect(box).toHaveValue('please keep me'));
  });

  it('clears the field when the send succeeded or reached the API', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(false);
    render(<ChatInput onSend={onSend} />);

    const box = screen.getByTestId('input-chat-message');
    await user.type(box, 'delivered');
    await user.click(screen.getByTestId('button-send-message'));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('delivered', undefined));
    expect(box).toHaveValue('');
  });
});
