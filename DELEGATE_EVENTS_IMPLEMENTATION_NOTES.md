# Delegate Events Implementation Notes

- `DelegateScreen1.js` selects the Events implementation by default and preserves a SensorReadings fallback.
- Delegate assignments are joined with service-item names, PCB mappings, and per-unit permissions.
- Only active assignments with monitor permission appear in the machine dropdown.
- Raw A1/A3 Events and connectivity data drive delegate telemetry and online status.
- View-only assignments show live data while power, temperature, mode, fan, and timer controls remain disabled.
- Command confirmation, five-minute timeout, Stop waiting, switching isolation, and per-PCB optimistic state match the customer screen.
- Unit switching immediately displays only the newly selected PCB data and rejects stale responses.
- Login assignment results are reused by the delegate context to avoid an immediate duplicate request.
- Delegate assignment/service-item failures use a bounded timeout and Retry now screen.
- Focused assignment and Events tests pass; authenticated browser checks covered login, assigned units, online/offline indicators, and switching.
