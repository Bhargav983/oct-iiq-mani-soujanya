export type FanSpeed = 'Low' | 'Medium' | 'High';
export type MachineMode = 'Cooling' | 'Fan' | 'Auto';

export type Machine = {
  id: string;
  service_item_id: string;
  service_item_name: string;
  pcb_serial_number: string;
  location: string;
  is_online: boolean;
  warranty_end_date: string;
  contract_end_date: string;
  room_temperature: number;
  set_temperature: number;
  humidity: number;
  fan_speed: FanSpeed;
  mode: MachineMode;
  error: string | null;
  power: boolean;
};

export type ServiceRequest = {
  id: string;
  machineId: string;
  machineName: string;
  problem: string;
  date: string;
  time: string;
  status: 'Open' | 'In Progress' | 'Closed';
  created: string;
};

export type ServiceDraft = {
  machineId: string | null;
  problem: string;
  otherText: string;
  date: string;
  time: string;
};

export type SuggestedAction = {
  id: string;
  label: string;
  payload: string;
  icon?: string;
};

export type Language = 'en' | 'ar' | 'hi';

export type Action =
  | { type: 'quick'; key: QuickActionKey }
  | { type: 'viewDetails'; machineId: string }
  | { type: 'checkStatus'; machineId: string }
  | { type: 'controls'; machineId: string }
  | { type: 'raiseService'; machineId?: string }
  | { type: 'checkMachineFirst'; machineId?: string }
  | { type: 'setControl'; machineId: string; setting: 'power' | 'temperature' | 'fan' | 'mode'; value: string | number | boolean }
  | { type: 'confirmChange' }
  | { type: 'cancelChange' }
  | { type: 'serviceSelectMachine'; machineId: string }
  | { type: 'serviceSelectProblem'; problem: string }
  | { type: 'serviceOtherText'; text: string }
  | { type: 'serviceSelectDate'; date: string }
  | { type: 'serviceSelectTime'; time: string }
  | { type: 'serviceEdit' }
  | { type: 'serviceSubmit' }
  | { type: 'viewRequestDetails'; requestId: string }
  | { type: 'askAnother' }
  | { type: 'newChat' }
  | { type: 'retry' }
  | { type: 'text'; text: string };

export type QuickActionKey =
  | 'myMachines'
  | 'status'
  | 'service'
  | 'controls'
  | 'voice'
  | 'errorLogs';

export type MessageKind =
  | 'text'
  | 'quickActions'

  // Existing
  | 'machines'
  | 'machineDetails'
  | 'statusSummary'
  | 'status'
  | 'controls'
  | 'confirmation'
  | 'serviceStep'
  | 'serviceSummary'
  | 'serviceSuccess'
  | 'serviceDetails'

  // New n8n driven widgets
  | 'machineTable'
  | 'machineDetailsCard'
  | 'controlMachineCard'
  | 'serviceRequestForm'
  | 'errorLogs'

  | 'loading'
  | 'error';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: MessageKind;
  text?: string;
  data?: any;
  loadingText?: string;
  suggestedActions?: SuggestedAction[];
  timestamp: number;
};
export interface AssistantApiResponse {
  reply: string;
  suggestedActions?: SuggestedAction[];

  uiType?:
    | 'machine_table'
    | 'machine_details_card'
    | 'control_machine_card'
    | 'service_request_form'
    | null;

  data?: unknown;
}

export type PendingControl = {
  machineId: string;
  setting: 'power' | 'temperature' | 'fan' | 'mode';
  value: string | number | boolean;
  label: string;
} | null;

export type ChatContext = {
  lang: Language;
  selectedMachineId: string | null;
  serviceDraft: ServiceDraft;
  pendingControl: PendingControl;
  lastRequestId: string | null;
};

export type VoiceState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SYNTHESIZING' | 'SPEAKING' | 'ERROR';

export type VoiceSocketState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface STTTranscriptEvent {
  isFinal: boolean;
  transcript: string;
  confidence?: number;
}

/**
 * Structural shape of the authenticated identity threaded through the
 * voice pipeline. Kept local to `types.ts` (instead of importing
 * `AuthParamsInput` from `services/api.ts`) to avoid a
 *   types.ts -> api.ts -> types.ts
 * import cycle. `AuthParamsInput` from `services/api.ts` is structurally
 * compatible with this interface.
 */
export interface VoiceAuthParams {
  userId?: string;
  companyId?: string;
}

export interface VoiceSocketConfig {
  url: string;
  sampleRate: 16000;
  onTranscript: (event: STTTranscriptEvent) => void;
  onError?: (error: string) => void;
  onStateChange?: (state: VoiceSocketState) => void;
  reconnectDelayMs?: number;
  /**
   * Authenticated identity injected into the WebSocket handshake. Sourced
   * from React <AuthContext /> via the `VoiceAssistantProvider` — sent in
   * the initial setup frame so the STT server can attribute transcripts
   * to the right customer/company even before any audio is streamed.
   */
  auth?: VoiceAuthParams;
}
export interface ErrorLogItem {
  id: string | number;
  error_code: string | number;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  timestamp: string;
}

export interface ErrorLogsCardData {
  pcb_serial_number: string;
  is_online: boolean;
  total_error_count: number;
  has_critical_errors: boolean;
  critical_error_count: number;
  top_critical_errors: ErrorLogItem[];
}