import type { Language } from '../types';
import { requestedLanguage } from './voiceLanguage';
import type { ChatMessage, ChatContext, Machine, ServiceRequest, SuggestedAction, ErrorLogsCardData } from '../types';
import { createMessageId } from '../utils/messageId';
import { setCachedMachines } from './machineService';
import type { AuthParams } from '../utils/useAuth';
import { createUuidV4, getChatSessionId } from './chatSession';
import { AssistantError, type AssistantErrorCode } from './assistantResponse';

// n8n Webhook endpoint for the HVAC chat flow.
const WEBHOOK_URL = 'https://n8ncustomer.air2o.net/webhook/hvac-chat-test-new-version-2';

// const WEBHOOK_URL = 'http://localhost:5000/api/chat';
// const WEBHOOK_URL = 'http://localhost:5000/api/hvac/chat';

/**
 * Authenticated identity that must be threaded into every outgoing n8n
 * webhook call. Provided by the React AuthContext via the
 * `VoiceAssistantProvider` — never hard-coded.
 *
 * `userId` and `companyId` are intentionally optional so callers can
 * short-circuit gracefully if the auth state hasn't hydrated yet (e.g.
 * very first render after a hard reload). Empty strings are still sent
 * to the webhook so the contract is satisfied server-side; downstream
 * n8n nodes are responsible for rejecting truly anonymous calls.
 */
export type AuthParamsInput = Partial<AuthParams>;


export type N8nCard =
  | { type: 'machines'; machines: Machine[] }
  | { type: 'machineDetails'; machine: Machine }
  | { type: 'status'; machine: Machine }
  | { type: 'statusSummary'; summary: { total: number; online: number; offline: number }; offline?: Machine[] }
  | { type: 'controls'; machine: Machine }
  | { type: 'confirmation'; machineName: string; label: string; command?: { setting: 'temperature'; serviceItemId: string; value: number } }
  | { type: 'serviceSuccess'; request: ServiceRequest }
  | { type: 'serviceDetails'; request: ServiceRequest }
  | { type: 'quickActions' }
  | { type: 'errorLogs'; logs: ErrorLogsCardData };

export type N8nResponse = {
  ok?: boolean;
  error_code?: AssistantErrorCode;
  user_message?: string;
  retryable?: boolean;
  request_id?: string;
  display_text?: string;
  speech_text?: string;
  text?: string;
  output?: string;
  reply?: string;
  message?: string;
  result?: string;
  answer?: string;
  response?: string;
  suggestedActions?: SuggestedAction[];
  cards?: N8nCard[];
  contextPatch?: Partial<ChatContext>;
  data?: unknown;
  body?: unknown;
};

export async function callAssistant(
  chatInput: string,
  authParams?: AuthParamsInput,
  language: Language = 'en',
): Promise<N8nResponse> {
  const started = performance.now();
  const responseLanguage = requestedLanguage(chatInput, language);
  const userId = authParams?.userId?.trim();
  const companyId = authParams?.companyId?.trim();
  if (!userId || !companyId) {
    throw new AssistantError('AUTH_REQUIRED', 'Please sign in again so AIRA can access your account.', false);
  }
  const requestId = createUuidV4();
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
    body: JSON.stringify({
      message: chatInput,
      language: responseLanguage,
      response_language: responseLanguage,
      instructions: `Respond in ${{ en: 'English', hi: 'Hindi', ar: 'Arabic' }[responseLanguage]}. Your name is Aira; pronounce it as a name, never spell its letters.`,
      customer_id: userId,
      company_id: companyId,
      chat_session_id: getChatSessionId(),
      request_id: requestId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  console.info('[VoiceTiming] chat-response-ms', Math.round(performance.now() - started));
  const payload = normalizeN8nResponse(data);
  if (!res.ok || payload.ok === false || payload.error_code) {
    const errorCode = payload.error_code ?? (res.status === 429 ? 'LLM_RATE_LIMIT' : res.status >= 500 ? 'UPSTREAM_API_ERROR' : 'UNKNOWN');
    const resolvedRequestId = payload.request_id ?? requestId;
    const retryable = payload.retryable ?? (res.status === 429 || res.status >= 500);
    console.error('[AIRA] Assistant request failed', { errorCode, requestId: resolvedRequestId, retryable });
    throw new AssistantError(errorCode, payload.user_message ?? friendlyError(errorCode), retryable, resolvedRequestId);
  }
  return payload;
}

// Convert an n8n response into assistant chat messages + a context patch.
export function mapResponse(response: N8nResponse, chatInput?: string): {
  messages: ChatMessage[];
  contextPatch: Partial<ChatContext>;
} {
  console.log('mapResponse received:', response);
  const messages: ChatMessage[] = [];
  const now = Date.now();
  const suggestedActions = normalizeSuggestedActions(response.suggestedActions);

  // Handle n8n response format: { reply: "..." } or { output: "..." } or { text: "..." }
  const responseText = response.display_text ?? response.reply ?? response.text ?? response.output;
  console.log('responseText:', responseText);

  // If we have cards from n8n, use them directly
  if (response.cards && response.cards.length > 0) {
    for (const card of response.cards) {
      const rendered = cardToMessage(card, now, suggestedActions);
      if (rendered) messages.push(rendered);
    }
  }

  // Always render the plain text reply when present, even if cards are also returned.
  if (responseText && !messages.some(message => message.data?.temperatureConfirmation)) {
    messages.push({
      id: createMessageId('api'),
      role: 'assistant',
      kind: 'text',
      text: responseText,
      speechText: response.speech_text,
      suggestedActions,
      timestamp: now,
    });
  }

  // If the webhook returned neither text nor cards, show a friendly fallback.
  if (messages.length === 0) {
    messages.push({
      id: createMessageId('api'),
      role: 'assistant',
      kind: 'text',
      text: "I couldn't understand that. Try tapping a button below or asking another way.",
      suggestedActions,
      timestamp: now,
    });
  }

  return { messages, contextPatch: response.contextPatch ?? {} };
}

function cardToMessage(card: N8nCard, now: number, suggestedActions?: SuggestedAction[]): ChatMessage | null {
  const base = { id: createMessageId('api'), role: 'assistant' as const, timestamp: now };
  switch (card.type) {
    case 'machines': {
      const machinesCard = card as { type: 'machines'; machines?: Machine[]; items?: unknown[] };
      let machinesToCache: Machine[] = [];
      
      if (machinesCard.machines?.length) {
        machinesToCache = machinesCard.machines.map(normalizeMachine);
      } else {
        const items = Array.isArray(machinesCard.items) ? machinesCard.items : [];
        machinesToCache = items.map((item, index) => {
          const raw = item as Record<string, unknown>;
          const title = String(raw.title ?? raw.name ?? raw.service_item_name ?? 'Unknown');
          const description = String(raw.description ?? raw.details ?? raw.info ?? '');
          // Parse structured fields from description if present (e.g. "Serial: SL0012 | PCB: 1234567890 | Location: Sircillaaaaaa | Status: Active")
          const serialMatch = description.match(/Serial:\s*([^|]+)/);
          const pcbMatch = description.match(/PCB:\s*([^|]+)/);
          const locationMatch = description.match(/Location:\s*([^|]+)/);
          const statusMatch = description.match(/Status:\s*([^|]+)/);
          const isOnline = (statusMatch?.[1]?.trim().toLowerCase() ?? 'active') === 'active';
          return normalizeMachine({
            id: String(raw.id ?? raw.service_item_id ?? `machine-${index}`),
            service_item_id: String(raw.service_item_id ?? raw.id ?? ''),
            service_item_name: title,
            pcb_serial_number: pcbMatch ? pcbMatch[1].trim() : '',
            location: locationMatch ? locationMatch[1].trim() : '',
            is_online: isOnline,
            warranty_end_date: String(raw.warranty_end_date ?? raw.warranty ?? ''),
            contract_end_date: String(raw.contract_end_date ?? raw.contract ?? ''),
            room_temperature: Number(raw.room_temperature ?? raw.temp ?? 0),
            set_temperature: Number(raw.set_temperature ?? raw.set_temp ?? 0),
            humidity: Number(raw.humidity ?? 0),
            fan_speed: (raw.fan_speed ?? 'Medium') as Machine['fan_speed'],
            mode: (raw.mode ?? 'Cooling') as Machine['mode'],
            error: String(raw.error ?? null),
            power: Boolean(raw.power ?? true),
          });
        });
      }
      
      // CRITICAL: Automatically cache machines from n8n response
      setCachedMachines(machinesToCache);
      
      return { ...base, kind: 'machines', data: { machines: machinesToCache }, suggestedActions };
    }
    case 'machineDetails':
      return { ...base, kind: 'machineDetails', data: { machine: normalizeMachine(card.machine) }, suggestedActions };
    case 'status':
      return { ...base, kind: 'status', data: { machine: normalizeMachine(card.machine) }, suggestedActions };
    case 'statusSummary':{
      // Changed: Fallback to [] if card.offline is undefined or omitted by n8n
      const rawCard = card as any;
      const offline = Array.isArray(rawCard.offline) ? rawCard.offline.map(normalizeMachine) : [];
      return { ...base, kind: 'statusSummary', data: { summary: card.summary, offline }, suggestedActions };
    }
    case 'controls':
      return { ...base, kind: 'controls', data: { machine: normalizeMachine(card.machine) }, suggestedActions };
    case 'confirmation': {
      const label = typeof card.label === 'string' ? card.label.trim() : '';
      const machineName = typeof card.machineName === 'string' ? card.machineName.trim() : '';
      const legacy = /^set (?:temp(?:erature)?|setpoint) to (\d{1,2})\s*(?:°\s*C|degrees? Celsius)\??$/i.exec(label);
      const structured = card.command?.setting === 'temperature';
      const temperatureConfirmation = structured || /\b(?:temp(?:erature)?|setpoint)\b/i.test(label);
      const temperatureCommand = structured && machineName && typeof card.command.serviceItemId === 'string' && card.command.serviceItemId.trim()
        ? { machineId: card.command.serviceItemId.trim(), machineName, temperature: card.command.value }
        : !structured && legacy && machineName
          ? { machineName, temperature: Number(legacy[1]) }
          : undefined;
      return { ...base, kind: 'confirmation', data: { machineName, label: label.replace(/\?$/, ''), temperatureConfirmation, temperatureCommand }, suggestedActions };
    }
    case 'serviceSuccess':
      return { ...base, kind: 'serviceSuccess', data: { request: card.request }, suggestedActions };
    case 'serviceDetails':
      return { ...base, kind: 'serviceDetails', data: { request: card.request }, suggestedActions };
    case 'errorLogs':
      return { ...base, kind: 'errorLogs', data: { logs: card.logs }, suggestedActions };
    case 'quickActions':
      return { ...base, kind: 'quickActions', suggestedActions };
    default:
      return null;
  }
}

function normalizeSuggestedActions(actions?: SuggestedAction[]): SuggestedAction[] {
  if (!actions?.length) return [];

  return actions
    .map((action, index) => ({
      id: String(action?.id ?? `suggested-${index}`),
      label: String(action?.label ?? '').trim(),
      payload: String(action?.payload ?? '').trim(),
      icon: action?.icon ? String(action.icon).trim() : undefined,
    }))
    .filter((action) => action.label.length > 0 && action.payload.length > 0);
}

function normalizeN8nResponse(data: unknown): N8nResponse {
  const payload = Array.isArray(data) ? data[0] : data;

  if (typeof payload === 'string') {
    return { reply: payload };
  }

  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const body = record.body;
  const inner = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const dataField = record.data;
  const nestedData = dataField && typeof dataField === 'object' ? (dataField as Record<string, unknown>) : {};

  return {
    ...record,
    ...inner,
    ...nestedData,
    reply: pickText(record.display_text, record.reply, record.text, record.output, record.message, record.result, record.answer, record.response, inner.display_text, inner.reply, inner.text, inner.output, nestedData.display_text, nestedData.reply, nestedData.text, nestedData.output),
    suggestedActions: pickSuggestedActions(record.suggestedActions, inner.suggestedActions, nestedData.suggestedActions),
    cards: pickCards(record.cards, inner.cards, nestedData.cards),
    contextPatch: pickContextPatch(record.contextPatch, inner.contextPatch, nestedData.contextPatch),
  };
}

function friendlyError(code: AssistantErrorCode): string {
  switch (code) {
    case 'AUTH_REQUIRED': return 'Please sign in again so AIRA can access your account.';
    case 'TOOL_TIMEOUT': return 'The HVAC system took too long to respond. Please try again.';
    case 'TOOL_SCHEMA_ERROR': return 'Some required details are missing. Please check them and try again.';
    case 'LLM_RATE_LIMIT': return 'AIRA is busy right now. Please try again in a moment.';
    case 'UPSTREAM_API_ERROR': return 'I could not reach the HVAC service. Please try again in a moment.';
    default: return 'I could not complete that request. Please try again in a moment.';
  }
}

function pickText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }

  return undefined;
}

function pickSuggestedActions(...values: unknown[]): SuggestedAction[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) return value as SuggestedAction[];
  }

  return undefined;
}

function pickCards(...values: unknown[]): N8nCard[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) return value as N8nCard[];
  }

  return undefined;
}

function pickContextPatch(...values: unknown[]): Partial<ChatContext> | undefined {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Partial<ChatContext>;
    }
  }

  return undefined;
}

// Coerce loose webhook payloads into the typed Machine shape the UI expects.
function normalizeMachine(m: Machine): Machine {
  return {
    id: String(m.id ?? m.service_item_id ?? Math.random().toString(36).slice(2)),
    service_item_id: String(m.service_item_id ?? ''),
    service_item_name: String(m.service_item_name ?? 'Unknown'),
    pcb_serial_number: String(m.pcb_serial_number ?? ''),
    location: String(m.location ?? ''),
    is_online: Boolean(m.is_online),
    warranty_end_date: String(m.warranty_end_date ?? ''),
    contract_end_date: String(m.contract_end_date ?? ''),
    room_temperature: Number(m.room_temperature ?? 0),
    set_temperature: Number(m.set_temperature ?? 0),
    humidity: Number(m.humidity ?? 0),
    fan_speed: (m.fan_speed === 'High' || m.fan_speed === 'Low' ? m.fan_speed : 'Medium') as Machine['fan_speed'],
    mode: (m.mode === 'Fan' || m.mode === 'Auto' ? m.mode : 'Cooling') as Machine['mode'],
    error: m.error ?? null,
    power: m.power ?? true,
  };
}
