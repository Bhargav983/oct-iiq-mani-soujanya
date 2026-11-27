import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantPage } from './AssistantPage';
import { t } from '../i18n/strings';

jest.mock('../context/VoiceAssistantContext', () => {
  const context = {
    setVoiceLanguage: jest.fn(),
    registerResultHandler: jest.fn(),
    registerSnapshotHandler: jest.fn(),
  };
  return { useVoiceAssistantContext: () => context };
});
jest.mock('../services/machineService', () => ({ getMachines: () => [{}] }));
jest.mock('./AssistantHeader', () => ({
  AssistantHeader: ({ lang, onLangChange }) => (
    <select aria-label="Chat language" value={lang} onChange={event => onLangChange(event.target.value)}>
      <option value="en">English</option>
      <option value="ar">Arabic</option>
    </select>
  ),
}));
jest.mock('./ChatInput', () => ({ ChatInput: () => null }));
jest.mock('./ChatMessage', () => ({ ChatMessageView: ({ message }) => <span>{message.text}</span> }));

test('switches the greeting and only the chat direction when Arabic is selected', () => {
  const previousScrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = jest.fn();
  try {
    const originalDir = document.documentElement.getAttribute('dir');
    const originalLang = document.documentElement.getAttribute('lang');
    const { unmount } = render(<AssistantPage />);
    const chat = screen.getByText(t('en').welcome).closest('.aira-chat-container');
    const select = screen.getByRole('combobox', { name: 'Chat language' });

    fireEvent.change(select, { target: { value: 'ar' } });
    expect(screen.getByText(t('ar').welcome)).toBeInTheDocument();
    expect(chat).toHaveAttribute('dir', 'rtl');
    expect(chat).toHaveAttribute('lang', 'ar');
    expect(document.documentElement.getAttribute('dir')).toBe(originalDir);
    expect(document.documentElement.getAttribute('lang')).toBe(originalLang);

    fireEvent.change(select, { target: { value: 'en' } });
    expect(screen.getByText(t('en').welcome)).toBeInTheDocument();
    expect(chat).toHaveAttribute('dir', 'ltr');
    fireEvent.change(select, { target: { value: 'ar' } });
    unmount();
    expect(document.documentElement.getAttribute('dir')).toBe(originalDir);
    expect(document.documentElement.getAttribute('lang')).toBe(originalLang);
  } finally {
    HTMLElement.prototype.scrollTo = previousScrollTo;
  }
});
