import type {
  Action,
  ChatMessage,
  ChatContext,
  Machine,
  ServiceDraft,
  PendingControl,
} from '../types';
import { getMachineById } from './machineService';
import { createServiceRequest, getRequestById } from './serviceRequestService';
import { callAssistant, mapResponse } from './api';
import { t } from '../i18n/strings';
import type { Language } from '../types';
import type { SuggestedAction } from '../types';
import { createMessageId } from '../utils/messageId';

export type { ChatContext };

export function makeInitialContext(): ChatContext {
  return {
    lang: 'en',
    selectedMachineId: null,
    serviceDraft: emptyDraft(),
    pendingControl: null,
    lastRequestId: null,
  };
}

export function emptyDraft(): ServiceDraft {
  return {
    machineId: null,
    problem: '',
    otherText: '',
    date: '',
    time: '',
  };
}

export type DispatchResult = {
  loadingMessage: ChatMessage | null;
  run: () => Promise<{ messages: ChatMessage[]; contextPatch: Partial<ChatContext> }>;
};

function assistant(
  kind: ChatMessage['kind'],
  data?: any,
  text?: string,
  loadingText?: string
): ChatMessage {
  return { id: createMessageId('m'), role: 'assistant', kind, data, text, loadingText, timestamp: Date.now() };
}

function loading(text: string): ChatMessage {
  return assistant('loading', undefined, undefined, text);
}

function machineName(m?: Machine): string {
  return m?.service_item_name ?? 'this machine';
}

// Build the chatInput string sent to the n8n webhook for a given action.
function actionToChatInput(action: Action, ctx: ChatContext): string {
  const s = t(ctx.lang);
  switch (action.type) {
    case 'quick':
      if (action.key === 'myMachines') return s.qaMyMachines;
      if (action.key === 'offline') return s.qaOffline;
      if (action.key === 'status') return s.qaStatus;
      if (action.key === 'service') return s.qaService;
      if (action.key === 'controls') return s.qaControls;
      if (action.key === 'voice') return 'Ask by voice';
      return '';
    case 'viewDetails':
      return `View details for machine`;
    case 'checkStatus':
      return `Check status of machine`;
    case 'controls':
      return `Show controls for machine`;
    case 'raiseService':
      return action.machineId
        ? `Raise service request for machine`
        : s.qaService;
    case 'checkMachineFirst':
      return s.checkMachineFirst;
    case 'setControl':
      return describeControl(action.setting, action.value, s);
    case 'confirmChange':
      return ctx.pendingControl ? `Confirm ${ctx.pendingControl.label}` : s.confirm;
    case 'cancelChange':
      return s.cancel;
    case 'serviceSelectMachine':
      return `Service for machine`;
    case 'serviceSelectProblem':
      return `Problem: ${action.problem}`;
    case 'serviceOtherText':
      return `Problem: ${action.text}`;
    case 'serviceSelectDate':
      return `Preferred date: ${action.date}`;
    case 'serviceSelectTime':
      return `Preferred time: ${action.time}`;
    case 'serviceEdit':
      return 'Edit service request';
    case 'serviceSubmit':
      return 'Submit service request';
    case 'viewRequestDetails':
      return `Check service request details for ${action.requestId}`;
    case 'askAnother':
      return 'Ask another question';
    case 'retry':
      return s.tryAgainBtn;
    case 'text':
      return action.text;
    default:
      return '';
  }
}

function loadingTextFor(action: Action, s: ReturnType<typeof t>): string {
  switch (action.type) {
    case 'quick':
      if (action.key === 'myMachines' || action.key === 'offline') return s.loadingMachines;
      if (action.key === 'status') return s.loadingStatus;
      if (action.key === 'service') return s.loadingService;
      if (action.key === 'controls') return s.loadingDetails;
      return s.loadingDetails;
    case 'viewDetails':
      return s.loadingDetails;
    case 'checkStatus':
      return s.loadingStatus;
    case 'controls':
      return s.loadingDetails;
    case 'raiseService':
    case 'serviceSubmit':
      return s.loadingService;
    case 'setControl':
    case 'confirmChange':
      return s.loadingCommand;
    case 'retry':
      return s.loadingMachines;
    default:
      return s.loadingDetails;
  }
}

export function dispatch(action: Action, ctx: ChatContext): DispatchResult {
  const s = t(ctx.lang);

  // Local-only actions that don't need the webhook (pure UI state transitions).
  if (action.type === 'setControl') {
    const label = describeControl(action.setting, action.value, s);
    const pending: PendingControl = {
      machineId: action.machineId,
      setting: action.setting,
      value: action.value,
      label,
    };
    return {
      loadingMessage: null,
      run: async () => ({
        messages: [assistant('confirmation', { machineName: 'machine', label })],
        contextPatch: { pendingControl: pending, selectedMachineId: action.machineId },
      }),
    };
  }

  if (action.type === 'cancelChange') {
    return {
      loadingMessage: null,
      run: async () => ({
        messages: [assistant('text', undefined, 'Okay, cancelled.')],
        contextPatch: { pendingControl: null },
      }),
    };
  }

  // Service request guided flow is handled locally (multi-step form state).
  const local = localServiceFlow(action, ctx);
  if (local) return local;

  // Everything else goes to the n8n webhook.
  const chatInput = actionToChatInput(action, ctx);
  const loadingMsg = loading(loadingTextFor(action, s));

  return {
    loadingMessage: loadingMsg,
    run: async () => {
      try {
        const response = await callAssistant(chatInput);
        const { messages, contextPatch } = mapResponse(response, chatInput);
        return { messages, contextPatch };
      } catch {
        return {
          messages: [assistant('error')],
          contextPatch: {},
        };
      }
    },
  };
}

// The multi-step service request form runs locally for snappy UX.
function localServiceFlow(action: Action, ctx: ChatContext): DispatchResult | null {
  switch (action.type) {
    case 'serviceSelectMachine': {
      const draft = { ...ctx.serviceDraft, machineId: action.machineId };
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('serviceStep', { step: 2, draft })],
          contextPatch: { serviceDraft: draft, selectedMachineId: action.machineId },
        }),
      };
    }
    case 'serviceSelectProblem': {
      const draft = { ...ctx.serviceDraft, problem: action.problem };
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('serviceStep', { step: 3, draft })],
          contextPatch: { serviceDraft: draft },
        }),
      };
    }
    case 'serviceOtherText': {
      const draft = { ...ctx.serviceDraft, problem: 'Other', otherText: action.text };
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('serviceStep', { step: 3, draft })],
          contextPatch: { serviceDraft: draft },
        }),
      };
    }
    case 'serviceSelectDate': {
      const draft = { ...ctx.serviceDraft, date: action.date };
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('serviceStep', { step: 4, draft })],
          contextPatch: { serviceDraft: draft },
        }),
      };
    }
    case 'serviceSelectTime': {
      const draft = { ...ctx.serviceDraft, time: action.time };
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('serviceStep', { step: 5, draft })],
          contextPatch: { serviceDraft: draft },
        }),
      };
    }
    case 'serviceEdit': {
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('serviceStep', { step: 1, draft: ctx.serviceDraft })],
          contextPatch: {},
        }),
      };
    }
    case 'serviceSubmit': {
      return {
        loadingMessage: loading(t(ctx.lang).loadingService),
        run: async () => {
          const req = createServiceRequest(ctx.serviceDraft);
          return {
            messages: [assistant('serviceSuccess', { request: req })],
            contextPatch: { lastRequestId: req.id, serviceDraft: emptyDraft() },
          };
        },
      };
    }
    case 'askAnother': {
      return {
        loadingMessage: null,
        run: async () => ({
          messages: [assistant('quickActions', { suggestedActions: defaultSuggestedActions(ctx.lang) })],
          contextPatch: {},
        }),
      };
    }
    default:
      return null;
  }
}

function describeControl(setting: string, value: any, s: ReturnType<typeof t>): string {
  if (setting === 'power') return value ? 'Power ON' : 'Power OFF';
  if (setting === 'temperature') return `Set temperature to ${value}\u00B0C`;
  if (setting === 'fan') return `Fan speed: ${value}`;
  if (setting === 'mode') return `Mode: ${value}`;
  return 'Change setting';
}

export function defaultSuggestedActions(lang: Language): SuggestedAction[] {
  const s = t(lang);
  return [
    { id: 'my-machines', label: s.qaMyMachines, payload: s.qaMyMachines, icon: 'snow' },
    { id: 'offline-machines', label: s.qaOffline, payload: s.qaOffline, icon: 'wifi-off' },
    { id: 'machine-status', label: s.qaStatus, payload: s.qaStatus, icon: 'alert-triangle' },
    { id: 'service-request', label: s.qaService, payload: s.qaService, icon: 'wrench' },
    { id: 'control-machine', label: s.qaControls, payload: s.qaControls, icon: 'sliders' },
    { id: 'voice-input', label: s.qaVoice, payload: s.qaVoice, icon: 'mic' },
  ];
}
