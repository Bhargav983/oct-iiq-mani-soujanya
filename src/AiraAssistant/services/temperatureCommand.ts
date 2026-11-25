import baseURL from '../../Components/ApiUrl/Apiurl';
import { fetchCustomerServiceItems } from '../../Components/Screens/MachineScreensNew/serviceItemsService';
import { eventMatchesCommand, fetchSegregatedDeviceData, fetchStatusEventsForPCB } from '../../Components/Screens/MachineScreensNew/deviceEventsService';
import { postControllerCommand } from '../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/controllerApi';
import type { AuthParamsInput } from './api';

export type TemperatureCommand = { machineId?: string; machineName: string; temperature: number };
export const MIN_SETPOINT = 18;
export const MAX_SETPOINT = 30;

export function validSetpoint(value: number) {
  return Number.isInteger(value) && value >= MIN_SETPOINT && value <= MAX_SETPOINT;
}

export async function setMachineTemperature(
  command: TemperatureCommand,
  auth: AuthParamsInput,
  onSent: () => void,
  signal: AbortSignal,
): Promise<'updated' | 'unverified'> {
  if (!validSetpoint(command.temperature)) throw new Error('Choose a whole temperature between 18°C and 30°C.');
  if (!auth.userId || !auth.companyId) throw new Error('Sign in to control a machine.');

  const items = await fetchCustomerServiceItems(baseURL, auth.userId, auth.companyId);
  if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const matches = items.filter(item => command.machineId
    ? String(item.service_item_id) === command.machineId
    : String(item.service_item_name).trim().toLowerCase() === command.machineName.trim().toLowerCase());
  if (matches.length !== 1 || !matches[0].pcb_serial_number) {
    throw new Error('Choose the exact machine from Control Machine and confirm again.');
  }
  if (command.machineId && command.machineName !== 'Selected machine'
    && String(matches[0].service_item_name).trim().toLowerCase() !== command.machineName.trim().toLowerCase()) {
    throw new Error('The machine name changed or does not match. Select the machine and confirm again.');
  }

  const serial = matches[0].pcb_serial_number;
  const snapshot = await fetchSegregatedDeviceData(serial, signal);
  if (!snapshot?.is_online || snapshot.hvac_on?.value !== '1') {
    throw new Error('The machine must be online and switched on.');
  }
  if (!snapshot.mode || !snapshot.fan_speed || !snapshot.latest_status_event_id) {
    throw new Error('Current machine settings are unavailable. Try again after refreshing its status.');
  }
  const payload = {
    Header: '0xAA',
    DI: serial,
    MD: Number(snapshot.mode.value),
    FS: Number(snapshot.fan_speed.value),
    SRT: command.temperature,
    HVAC: '1',
    Footer: '0xZX',
  };
  if (!Number.isInteger(payload.MD) || !Number.isInteger(payload.FS)) {
    throw new Error('Current mode or fan speed is unavailable.');
  }
  const response = await postControllerCommand(payload, signal);
  if (!response.ok) throw new Error('The controller rejected the temperature command.');
  onSent();

  const baseline = Number(snapshot.latest_status_event_id);
  for (let attempt = 0; attempt < 15 && !signal.aborted; attempt++) {
    try {
      const events = await fetchStatusEventsForPCB(serial, signal);
      if (events.some(event => Number(event.id) > baseline
        && eventMatchesCommand(event.parsed, { ...payload, confirmationFields: ['SRT'] }))) return 'updated';
    } catch {
      if (signal.aborted) break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return 'unverified';
}
