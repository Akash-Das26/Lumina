import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
