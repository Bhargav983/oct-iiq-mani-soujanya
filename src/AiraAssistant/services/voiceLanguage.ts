import type { Language } from '../types';
export function requestedLanguage(text: string, fallback: Language): Language {
  if (/(?:speak|reply|respond|answer|talk).*\bhindi\b|हिंदी में|हिन्दी में/i.test(text)) return 'hi';
  if (/(?:speak|reply|respond|answer|talk).*\barabic\b|بالعربية/i.test(text)) return 'ar';
  if (/(?:speak|reply|respond|answer|talk).*\benglish\b/i.test(text)) return 'en';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  return fallback;
}
export function speechText(text: string) {
  return text.replace(/\bA(?:[ .-]+I[ .-]+R[ .-]+A|IRA)\b/g, 'Aira').replace(/[*_#`]/g, '').trim();
}
export function speechLanguage(text: string): Language {
  return /[\u0900-\u097f]/.test(text) ? 'hi' : /[\u0600-\u06ff]/.test(text) ? 'ar' : 'en';
}
