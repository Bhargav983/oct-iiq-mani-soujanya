import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { ChatInput } from './ChatInput';
import { getMachines, setCachedMachines } from '../services/machineService';

jest.mock('axios');
jest.mock('../context/VoiceAssistantContext', () => ({
  useVoiceAssistantContext: () => ({ userId: 'u', companyId: 'c' }),
}));
jest.mock('../hooks/useInlineDictation', () => ({
  useInlineDictation: () => ({ supported: false }),
}));

test('renames a machine from its mention row without changing or sending the draft', async () => {
  setCachedMachines([{ id: 'board', service_item_id: '42', service_item_name: 'Board 3', location: '', pcb_serial_number: 'pcb' }]);
  axios.put.mockResolvedValue({ data: { status: 'success', data: { service_item_id: '42', service_item_name: 'Lobby' } } });
  const onSend = jest.fn();
  render(<ChatInput lang="en" suggestedActions={[]} onSend={onSend} />);
  const draft = screen.getByRole('textbox');
  fireEvent.change(draft, { target: { value: 'status of @', selectionStart: 11 } });
  fireEvent.click(screen.getByRole('button', { name: 'Edit name for Board 3' }));
  const name = await screen.findByLabelText('Service Item Name');
  expect(name.value).toBe('Board 3');
  fireEvent.change(name, { target: { value: 'Lobby' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() => expect(getMachines()[0].service_item_name).toBe('Lobby'));
  expect(axios.put).toHaveBeenCalledWith(expect.stringContaining('/service-items/42/'),
    { service_item_name: 'Lobby', user_id: 'u', company_id: 'c' },
    { params: { user_id: 'u', company_id: 'c' } });
  expect(draft.value).toBe('status of @');
  expect(onSend).not.toHaveBeenCalled();
});
