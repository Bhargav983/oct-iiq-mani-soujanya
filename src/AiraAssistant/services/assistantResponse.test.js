import { normalizeDisplayMarkdown, stripMarkdownForSpeech } from './assistantResponse';
import { getChatSessionId, resetChatSessionId } from './chatSession';
import { requestedLanguage } from './voiceLanguage';

test('normalizes observed heading, list, bold, and inline LaTeX defects without changing content', () => {
  expect(normalizeDisplayMarkdown('### **\n1. Safety**\\n* ** Isolate Power: **Text')).toBe('### 1. Safety\n\n- **Isolate Power:** Text');
  expect(normalizeDisplayMarkdown('###1.Heading')).toBe('### 1. Heading');
  expect(normalizeDisplayMarkdown('1.Step')).toBe('1. Step');
  expect(normalizeDisplayMarkdown('*****Isolate Power:*Text')).toBe('**Isolate Power:** Text');
  expect(normalizeDisplayMarkdown('Intro:\n- Item 1\n- Item 2')).toBe('Intro:\n\n- Item 1\n- Item 2');
  expect(normalizeDisplayMarkdown('Verify supply voltage (within $\\pm 10\\%$).')).toBe('Verify supply voltage (within ±10%).');
});

test('removes unmatched bold markers and preserves valid Markdown', () => {
  expect(normalizeDisplayMarkdown('**Status:** Online')).toBe('**Status:** Online');
  expect(normalizeDisplayMarkdown('an **AC fin comb*')).toBe('an AC fin comb');
});

test('stripMarkdownForSpeech removes Markdown syntax cleanly for TTS', () => {
  expect(stripMarkdownForSpeech('### 1. Safety\n\n- **Isolate Power:** Turn off breaker.')).toBe('1. Safety. Isolate Power: Turn off breaker.');
});

test('requestedLanguage detects Hindi, Arabic, and explicit language switches', () => {
  expect(requestedLanguage('मेरे पास कितनी मशीनें हैं?', 'en')).toBe('hi');
  expect(requestedLanguage('كم عدد أجهزتي؟', 'en')).toBe('ar');
  expect(requestedLanguage('Please reply in Hindi', 'en')).toBe('hi');
  expect(requestedLanguage('Please answer in Arabic', 'en')).toBe('ar');
  expect(requestedLanguage('How many machines?', 'hi')).toBe('hi');
});

test('session IDs are UUIDs, stable per tab, and rotate only for a new chat', () => {
  const first = getChatSessionId();
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(getChatSessionId()).toBe(first);
  const next = resetChatSessionId();
  expect(next).not.toBe(first);
  expect(getChatSessionId()).toBe(next);
});
