import { requestedLanguage, speechText, speechLanguage } from './voiceLanguage';
test('explicit language switching uses the current conversation fallback', () => {
  expect(requestedLanguage('Please speak in Hindi', 'en')).toBe('hi');
  expect(requestedLanguage('हिंदी में जवाब दीजिए', 'en')).toBe('hi');
  expect(requestedLanguage('How is my AC?', 'hi')).toBe('hi');
  expect(requestedLanguage('Speak English', 'hi')).toBe('en');
  expect(requestedLanguage('Reply in Arabic', 'en')).toBe('ar');
});
test('normalizes the assistant name without rewriting identifiers', () => {
  expect(speechText('I am AIRA, also written A-I-R-A. AC-123')).toBe('I am Aira, also written Aira. AC-123');
  expect(speechLanguage('नमस्ते')).toBe('hi');
  expect(speechLanguage('مرحبا')).toBe('ar');
});
