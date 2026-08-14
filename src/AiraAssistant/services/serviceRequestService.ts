import type { ServiceRequest, ServiceDraft } from '../types';

// Service requests will now be handled through n8n webhook
// The actual implementation will be handled by the API service

export function createServiceRequest(draft: ServiceDraft): ServiceRequest {
  // This will be populated from n8n webhook response
  const req: ServiceRequest = {
    id: `SA-GA-012026-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
    machineId: draft.machineId ?? '',
    machineName: 'Unknown', // Will be populated from n8n
    problem: draft.problem === 'Other' ? draft.otherText || 'Other' : draft.problem,
    date: draft.date,
    time: draft.time,
    status: 'Open',
    created: 'Today',
  };
  return req;
}

export function getRequestById(id: string): ServiceRequest | undefined {
  // This will be populated from n8n webhook response
  return undefined;
}
