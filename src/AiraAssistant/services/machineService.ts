import type { Machine } from '../types';

// In-memory cache for machines - strictly in-memory, no localStorage
let cachedMachines: Machine[] = [];

// Set cached machines with deduplication by id or service_item_id
export function setCachedMachines(machines: Machine[]): void {
  const deduped: Machine[] = [];
  const seen = new Set<string>();
  
  for (const machine of machines) {
    const key = machine.id || machine.service_item_id;
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(machine);
    }
  }
  
  cachedMachines = deduped;
}

// Add or update a single machine in memory
export function cacheSingleMachine(machine: Machine): void {
  const key = machine.id || machine.service_item_id;
  if (!key) return;
  
  const index = cachedMachines.findIndex(m => (m.id || m.service_item_id) === key);
  if (index >= 0) {
    cachedMachines[index] = machine;
  } else {
    cachedMachines.push(machine);
  }
}

// Get all machines from in-memory cache
export function getMachines(): Machine[] {
  return [...cachedMachines];
}

// Get machine by ID
export function getMachineById(id: string): Machine | undefined {
  return cachedMachines.find(m => m.id === id);
}

// Get online machines
export function getOnlineMachines(): Machine[] {
  return cachedMachines.filter(m => m.is_online);
}

// Get offline machines
export function getOfflineMachines(): Machine[] {
  return cachedMachines.filter(m => !m.is_online);
}

// Get machine by index
export function getMachineByIndex(index: number): Machine | undefined {
  return cachedMachines[index];
}

// Get status summary
export function getStatusSummary() {
  return {
    total: cachedMachines.length,
    online: cachedMachines.filter(m => m.is_online).length,
    offline: cachedMachines.filter(m => !m.is_online).length
  };
}
