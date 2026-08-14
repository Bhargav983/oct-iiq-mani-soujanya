# AiraAssistant to n8n Webhook & Response Contract

This document defines the complete end-to-end interface contract between the AiraAssistant frontend client and the n8n webhook API. It provides the exact payload specifications, message formats, and data schemas required to render the application's interactive components properly.

---

## 1. Webhook Request Format

Every user action that requires backend assistance is sent to n8n as an HTTP POST request.

- **URL:** `https://n8ncustomer.air2o.net/webhook/hvac-chat-test-new-version`
- **Content-Type:** `application/json`

### Request Payload Schema

```json
{
  "message": "View details for HVAC System 1",
  "customer_id": "05100",
  "company_id": "SA-GA-01"
}
```

- `message` (string, required): The natural language or command string describing the user's intent.
- `customer_id` (string, required): The unique ID representing the customer (currently hardcoded as `"05100"`).
- `company_id` (string, required): The unique ID representing the company (currently hardcoded as `"SA-GA-01"`).

---

## 2. Response Envelope & Normalization

The frontend client expects a JSON object in response from n8n. The API module normalizes the raw webhook payload to guarantee client resilience.

### Normalization Logic

- **Text Aliases:** The client searches for and resolves the primary text reply in the following order:
  `reply` ➔ `text` ➔ `output` ➔ `message` ➔ `result` ➔ `answer` ➔ `response`.
- **Payload Unwrapping:** If the payload is a raw string, it wraps it under `{ "reply": value }`. If the payload is wrapped inside a `body` or `data` property, the client extracts those properties and flattens them.
- **Single Element Arrays:** If the response is wrapped inside a single-element array (e.g. `[{ ... }]`), the client automatically extracts the first element.

### Complete Response Payload Structure

```json
{
  "reply": "Here is the information you requested.",
  "suggestedActions": [],
  "cards": [],
  "contextPatch": {}
}
```

---

## 3. Suggested Actions (Quick Reply Chips)

`suggestedActions` drives the horizontal scrollable quick-reply bar rendered above the sticky message composer.

### Chip Schema

```json
{
  "id": "my-machines",
  "label": "My Machines",
  "payload": "My Machines",
  "icon": "snow"
}
```

- `id` (string, optional): Unique identifier. If missing, is auto-generated as `suggested-{index}`.
- `label` (string, required): The visible text label displayed on the chip button.
- `payload` (string, required): The actual text payload dispatched to the webhook when the chip is tapped.
- `icon` (string, optional): Bootstrap icon name (e.g., `snow`, `wifi-off`, `exclamation-triangle`, `wrench`, `sliders`, `mic`).

---

## 4. Structured Cards Contract

The app renders UI widgets in the chat stream via the `cards` array. A single response can contain a plain text `reply` alongside one or more widgets in the `cards` array.

> ⚠️ **Important Note:** In `types.ts`, several message kinds are declared (`machineTable`, `machineDetailsCard`, `controlMachineCard`, `serviceRequestForm`, `uiType`). However, **these are currently unused/dead types and are not rendered** in `ChatMessageView`. Do not use them.

The following structure types are fully supported and rendered:

### 4.1. Machines List Widget (`machines`)

Renders a list of machine cards. Supports two response layouts:

#### Option A: Direct Machine Array (Preferred)

```json
{
  "type": "machines",
  "machines": [
    {
      "id": "TEMP1769692340428",
      "service_item_id": "12345",
      "service_item_name": "Server Room AC",
      "is_online": true,
      "power": true
    }
  ]
}
```

#### Option B: Generic Item Fallback (Legacy/Fallback)

If returned in this shape, the client automatically parses and extracts structured fields from the `description` string via regex (e.g. looking for patterns like `PCB:`, `Serial:`, `Location:`, `Status:`).

```json
{
  "type": "machines",
  "items": [
    {
      "id": "item-1",
      "title": "Server Room AC",
      "description": "Serial: SL0012 | PCB: 1234567890 | Location: Sircilla | Status: Active"
    }
  ]
}
```

---

### 4.2. Machine Details Card (`machineDetails`)

Renders the full detailed information of a specific machine.

```json
{
  "type": "machineDetails",
  "machine": {
    "id": "TEMP1769692340428",
    "service_item_id": "SI-8899",
    "service_item_name": "Main Hall Unit",
    "location": "Main Lobby",
    "warranty_end_date": "2027-12-31T00:00:00.000Z",
    "contract_end_date": "2028-12-31T00:00:00.000Z",
    "is_online": true,
    "power": true
  }
}
```

---

### 4.3. Single Machine Status Card (`status`)

Displays the real-time sensor metrics of a single machine.

```json
{
  "type": "status",
  "machine": {
    "id": "TEMP1769692340428",
    "service_item_name": "Main Hall Unit",
    "is_online": true,
    "room_temperature": 24,
    "set_temperature": 22,
    "humidity": 45,
    "fan_speed": "Medium",
    "mode": "Cooling",
    "error": null,
    "power": true
  }
}
```

---

### 4.4. Status Summary Card (`statusSummary`)

Displays overall system counts (total, online, offline) and lists any offline machines directly beneath.

```json
{
  "type": "statusSummary",
  "summary": {
    "total": 8,
    "online": 6,
    "offline": 2
  },
  "offline": [
    {
      "id": "TEMP1769692340429",
      "service_item_id": "SI-1122",
      "service_item_name": "Office 2 AC",
      "is_online": false
    }
  ]
}
```

---

### 4.5. Controls Card (`controls`)

Provides interactive controls to change the physical settings of an online machine (power toggle, set temperature, fan speed, and mode).

```json
{
  "type": "controls",
  "machine": {
    "id": "TEMP1769692340428",
    "service_item_name": "Main Hall Unit",
    "is_online": true,
    "power": true,
    "set_temperature": 22,
    "fan_speed": "Medium",
    "mode": "Cooling"
  }
}
```

---

### 4.6. Confirmation Dialog Card (`confirmation`)

Renders a simple confirmation action card for confirming pending setting changes.

```json
{
  "type": "confirmation",
  "machineName": "Main Hall Unit",
  "label": "Set temperature to 23°C"
}
```

---

### 4.7. Service Success Card (`serviceSuccess`)

Renders immediately upon a successfully registered service request.

```json
{
  "type": "serviceSuccess",
  "request": {
    "id": "REQ-87162",
    "machineId": "TEMP1769692340428",
    "machineName": "Main Hall Unit",
    "problem": "Not Cooling",
    "date": "Today",
    "time": "Morning",
    "status": "Open",
    "created": "2026-08-08 10:00 AM"
  }
}
```

---

### 4.8. Service Details View Card (`serviceDetails`)

Renders details of a previously submitted service request.

```json
{
  "type": "serviceDetails",
  "request": {
    "id": "REQ-87162",
    "machineId": "TEMP1769692340428",
    "machineName": "Main Hall Unit",
    "problem": "Not Cooling",
    "date": "Today",
    "time": "Morning",
    "status": "Open",
    "created": "2026-08-08 10:00 AM"
  }
}
```

---

### 4.9. Default Quick Actions Card (`quickActions`)

Forces rendering of the default grid of quick action tiles directly inside the chat flow.

```json
{
  "type": "quickActions"
}
```

---

## 5. Structured Object Schemas

To ensure flawless parsing and styling, nested objects must conform to these exact schemas.

### 5.1. Machine Object Shape

The client automatically normalizes missing properties or loose value types to prevent UI crashes. However, for a complete presentation, return the fields as follows:

```typescript
type Machine = {
  id: string;                      // Unique ID
  service_item_id: string;         // Customer-facing ID
  service_item_name: string;       // Name / label of machine
  pcb_serial_number: string;       // Hardware serial number
  location: string;                // Physical room/zone location
  is_online: boolean;              // True if reachable
  warranty_end_date: string;       // ISO date string or local formatted date
  contract_end_date: string;       // ISO date string or local formatted date
  room_temperature: number;        // Celsius value
  set_temperature: number;         // Celsius value (target)
  humidity: number;                // Percentage value
  fan_speed: "Low" | "Medium" | "High";
  mode: "Cooling" | "Fan" | "Auto";
  error: string | null;            // Detailed message or null if normal
  power: boolean;                  // True if system is powered ON
};
```

### 5.2. Service Request Object Shape

```typescript
type ServiceRequest = {
  id: string;                      // Ticket ID
  machineId: string;               // Associated machine ID
  machineName: string;             // Associated machine name
  problem: string;                 // Chosen issue or "Other"
  date: string;                    // Preferred visit date
  time: string;                    // Preferred visit time slot
  status: "Open" | "In Progress" | "Closed";
  created: string;                 // Date/time ticket was registered
};
```

---

## 6. Chat Context Patching

You can instruct the frontend to update its internal context state (e.g., selecting a machine or setting the last-viewed service request) by returning `contextPatch`. This is merged directly into the client's state.

```json
{
  "contextPatch": {
    "selectedMachineId": "TEMP1769692340428",
    "lastRequestId": "REQ-87162"
  }
}
```

### Context Patch fields

- `selectedMachineId` (string | null): Active machine selected in controls or status details.
- `lastRequestId` (string | null): The most recently referenced service request ID.
- `lang` (Language): Active language override (`"en"` | `"ar"` | `"hi"`).
