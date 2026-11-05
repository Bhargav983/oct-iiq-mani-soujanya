import { callAssistant } from './api';
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
test('Hindi request carries language and identity without replacing the user message', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ reply: 'नमस्ते' }) });
  await callAssistant('Please speak in Hindi', { userId: 'u', companyId: 'c' }, 'en');
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.message).toBe('Please speak in Hindi');
  expect(body.language).toBe('hi');
  expect(body.response_language).toBe('hi');
  expect(body.instructions).toContain('Respond in Hindi');
  expect(body.customer_id).toBe('u');
  expect(body.company_id).toBe('c');
});
