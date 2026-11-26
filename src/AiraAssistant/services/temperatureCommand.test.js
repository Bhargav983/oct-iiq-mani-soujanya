import { setMachineTemperature } from './temperatureCommand';
import { mapResponse } from './api';
import { fetchCustomerServiceItems } from '../../Components/Screens/MachineScreensNew/serviceItemsService';
import { fetchSegregatedDeviceData, fetchStatusEventsForPCB } from '../../Components/Screens/MachineScreensNew/deviceEventsService';
import { postControllerCommand } from '../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/controllerApi';

jest.mock('../../Components/Screens/MachineScreensNew/serviceItemsService');
jest.mock('../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/controllerApi');
jest.mock('../../Components/Screens/MachineScreensNew/deviceEventsService', () => ({
  ...jest.requireActual('../../Components/Screens/MachineScreensNew/deviceEventsService'),
  fetchSegregatedDeviceData: jest.fn(),
  fetchStatusEventsForPCB: jest.fn(),
}));

const command = { machineName: 'Board 3', temperature: 25 };
const auth = { userId: 'user', companyId: 'company' };
const item = { service_item_id: '3', service_item_name: 'Board 3', pcb_serial_number: 'pcb-3' };

beforeEach(() => {
  jest.clearAllMocks();
  fetchCustomerServiceItems.mockResolvedValue([item]);
  fetchSegregatedDeviceData.mockResolvedValue({
    is_online: true, hvac_on: { value: '1' }, mode: { value: '2' },
    fan_speed: { value: '1' }, latest_status_event_id: 100,
  });
  fetchStatusEventsForPCB.mockResolvedValue([{ id: 101, parsed: { values: { SRT: 25 } } }]);
  postControllerCommand.mockResolvedValue({ ok: true });
});

test('maps the existing temperature card into a command and suppresses premature success copy', () => {
  const { messages } = mapResponse({
    cards: [{ type: 'confirmation', machineName: 'Board 3', label: 'Set temp to 25°C' }],
    reply: 'Command sent.',
  });
  expect(messages).toHaveLength(1);
  expect(messages[0].data.temperatureCommand).toEqual(command);
});

test('submits the correct controller and reports success only after a new event', async () => {
  const onSent = jest.fn();
  const signal = new AbortController().signal;
  await expect(setMachineTemperature(command, auth, onSent, signal)).resolves.toBe('updated');
  expect(postControllerCommand).toHaveBeenCalledWith({
    Header: '0xAA', DI: 'pcb-3', MD: 2, FS: 1, SRT: 25, HVAC: '1', Footer: '0xZX',
  }, signal);
  expect(onSent).toHaveBeenCalledTimes(1);
});

test('rejects ambiguous labels and powered-off machines without sending a command', async () => {
  const signal = new AbortController().signal;
  fetchCustomerServiceItems.mockResolvedValueOnce([item, { ...item, service_item_id: '4' }]);
  await expect(setMachineTemperature(command, auth, jest.fn(), signal)).rejects.toThrow('exact machine');
  fetchSegregatedDeviceData.mockResolvedValueOnce({ is_online: true, hvac_on: { value: '0' } });
  await expect(setMachineTemperature(command, auth, jest.fn(), signal)).rejects.toThrow('switched on');
  expect(postControllerCommand).not.toHaveBeenCalled();
});

test('uses the selected customer machine ID when another machine is also available', async () => {
  fetchCustomerServiceItems.mockResolvedValue([item, {
    service_item_id: '9', service_item_name: 'Lobby Unit', pcb_serial_number: 'pcb-9',
  }]);
  const signal = new AbortController().signal;
  await expect(setMachineTemperature(
    { machineId: '9', machineName: 'Lobby Unit', temperature: 25 }, auth, jest.fn(), signal,
  )).resolves.toBe('updated');
  expect(fetchSegregatedDeviceData).toHaveBeenCalledWith('pcb-9', signal);
  expect(postControllerCommand).toHaveBeenCalledTimes(1);
  expect(postControllerCommand).toHaveBeenCalledWith(expect.objectContaining({ DI: 'pcb-9' }), signal);
});
