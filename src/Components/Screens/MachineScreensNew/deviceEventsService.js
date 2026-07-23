const EVENTS_FILTER_API_URL = "https://mdata.air2o.net/events/filter/";
const CONNECTIVITY_CHECK_API_URL = "https://mdata.air2o.net/connectivity-check/";
const CONNECTIVITY_CACHE_MS = 20000;
const EVENT_CACHE_MS = 2000;

let connectivityCache = { value: null, expiresAt: 0 };
let connectivityRequest = null;
const eventCache = new Map();
const eventRequests = new Map();

export const EVENT_PROTOCOL = {
  batches: { "0xA1": "Batch 1", "0xA2": "Batch 2", "0xA3": "Batch 3" },
  scaling: {
    ODT: 10,
    INDT: 10,
    AST: 10,
    RT: 10,
    INPC: 10,
    DPC: 10,
    P1C: 10,
    P2C: 10,
    P3C: 10,
    P1KW: 100,
    P2KW: 100,
    P3KW: 100,
    TP: 100,
  },
  dsFlags: { EOF: 0, HORB: 1, HPHF: 2, CDF: 3, HPC: 4, HPS: 5, ISOC: 6 },
  // Firmware rule: DS 0 is OFF; every nonzero DS value is ON.
  powerField: "DS",
};

export function detectBatchType(payload) {
  if (typeof payload !== "string") return null;
  const header = payload.trim().split(",", 1)[0];
  return EVENT_PROTOCOL.batches[header] || null;
}

export function parseEventPayload(payloadStr) {
  if (!payloadStr || typeof payloadStr !== "string") return null;
  const parts = payloadStr.split(",").map((part) => part.trim());
  const batchType = EVENT_PROTOCOL.batches[parts[0]];
  if (!batchType) return null;

  const values = {};
  for (const part of parts.slice(1)) {
    if (!part || part.startsWith("0x")) continue;
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    const code = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (code && value !== "") values[code] = value;
  }

  if (!values.DI) return null;
  return { batchType, values };
}

export function scaleEventValue(code, rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return null;
  const divisor = EVENT_PROTOCOL.scaling[code];
  return divisor ? numericValue / divisor : numericValue;
}

export function deviceStatusToPower(rawValue) {
  const status = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(status) || status < 0) return null;
  return status === 0 ? 0 : 1;
}

export function decodeDeviceStatus(rawValue) {
  const status = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(status) || status < 0) return {};
  return Object.fromEntries(
    Object.entries(EVENT_PROTOCOL.dsFlags).map(([name, bit]) => [name, (status >> bit) & 1])
  );
}

function parseEventTimestamp(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFreshEvent(event, now = Date.now(), thresholdMs = 90000) {
  const timestamp = parseEventTimestamp(event?.created_at);
  return !!timestamp && now - timestamp.getTime() <= thresholdMs;
}

export function normalizeEventsResponse(data) {
  const events = Array.isArray(data) ? data : data?.results || data?.data || [];
  return events
    .filter((event) => event && Number.isFinite(Number(event.id)))
    .sort((a, b) => Number(b.id) - Number(a.id));
}

export function reduceEventsToDeviceSnapshot(
  rawEvents,
  pcbSerialNumber,
  connectivity = { is_online: false },
  now = Date.now()
) {
  const events = normalizeEventsResponse(rawEvents).filter((event) => {
    const parsed = parseEventPayload(event.payload);
    return parsed?.values.DI === pcbSerialNumber;
  });

  const latestByBatch = {};
  for (const event of events) {
    const parsed = parseEventPayload(event.payload);
    if (!parsed || latestByBatch[parsed.batchType]) continue;
    latestByBatch[parsed.batchType] = { ...event, parsed: parsed.values };
  }

  const batch1 = latestByBatch["Batch 1"]?.parsed || {};
  const batch3 = latestByBatch["Batch 3"]?.parsed || {};
  const flags = decodeDeviceStatus(batch3.DS);
  const errorCode = scaleEventValue("EC", batch3.EC);
  const currentAlarmCount = errorCode && errorCode !== 0 ? 1 : 0;
  const newestEvent = events[0] || null;
  const isOnline = Boolean(connectivity?.is_online) || isFreshEvent(newestEvent, now);
  const asValue = (value) => (value === null || value === undefined ? null : { value: String(value) });

  return {
    pcb_serial_number: pcbSerialNumber,
    is_online: isOnline,
    outdoor_temperature: asValue(scaleEventValue("ODT", batch1.ODT)),
    room_humidity: asValue(scaleEventValue("RH", batch1.RH)),
    room_temperature: asValue(scaleEventValue("RT", batch1.RT)),
    mode: asValue(scaleEventValue("MD", batch3.MD)),
    fan_speed: asValue(scaleEventValue("FS", batch3.FS)),
    set_temperature: asValue(scaleEventValue("SRT", batch3.SRT)),
    hvac_on: asValue(deviceStatusToPower(batch3.DS)),
    hvac_busy: asValue(0),
    error_flag: asValue((flags.EOF || currentAlarmCount) ? 1 : 0),
    alarm_occurred: asValue(currentAlarmCount),
    error_code: asValue(errorCode),
    device_status_flags: flags,
    latest_event_id: newestEvent?.id ?? null,
    latest_status_event_id: latestByBatch["Batch 3"]?.id ?? null,
    last_seen_at: connectivity?.last_seen || newestEvent?.created_at || null,
  };
}

export function eventMatchesCommand(parsedEvent, command) {
  if (!parsedEvent || !command) return false;
  const values = parsedEvent.values || parsedEvent;
  const checks = [
    ["MD", command.MD],
    ["FS", command.FS],
    ["SRT", command.SRT],
    [EVENT_PROTOCOL.powerField, command.HVAC],
  ];
  const confirmationFields = command.confirmationFields;
  const relevantChecks = Array.isArray(confirmationFields)
    ? checks.filter(([field]) => confirmationFields.includes(field))
    : checks;

  if (relevantChecks.length === 0) return false;

  return relevantChecks.every(([field, expected]) => {
    if (expected === undefined) return true;
    if (values[field] === undefined) return false;
    if (field === EVENT_PROTOCOL.powerField) {
      return deviceStatusToPower(values[field]) === Number(expected);
    }
    return Number(values[field]) === Number(expected);
  });
}

export function clearEventServiceCaches() {
  connectivityCache = { value: null, expiresAt: 0 };
  connectivityRequest = null;
  eventCache.clear();
  eventRequests.clear();
}

export async function fetchConnectivityMap({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && connectivityCache.value && connectivityCache.expiresAt > now) {
    return connectivityCache.value;
  }
  if (!forceRefresh && connectivityRequest) return connectivityRequest;

  const request = (async () => {
    const response = await fetch(CONNECTIVITY_CHECK_API_URL);
    if (!response.ok) throw new Error(`Connectivity check failed: ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : data?.results || data?.data || [];
    const map = new Map(
      rows
        .filter((row) => row?.pcb_serial_number)
        .map((row) => [row.pcb_serial_number, row])
    );
    connectivityCache = { value: map, expiresAt: Date.now() + CONNECTIVITY_CACHE_MS };
    return map;
  })();

  if (!forceRefresh) connectivityRequest = request;
  try {
    return await request;
  } finally {
    if (connectivityRequest === request) connectivityRequest = null;
  }
}

export async function fetchDeviceEvents(
  pcbSerialNumber,
  limit = 100,
  signal,
  { forceRefresh = false } = {}
) {
  if (!pcbSerialNumber) return [];
  const cacheKey = `${pcbSerialNumber}:${limit}`;
  const cached = eventCache.get(cacheKey);
  if (!forceRefresh && !signal && cached?.expiresAt > Date.now()) return cached.value;
  if (!forceRefresh && !signal && eventRequests.has(cacheKey)) {
    return eventRequests.get(cacheKey);
  }

  const url = `${EVENTS_FILTER_API_URL}?device_id=${encodeURIComponent(pcbSerialNumber)}&limit=${limit}`;
  const request = (async () => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Event fetch failed: ${response.status}`);
    const events = normalizeEventsResponse(await response.json()).filter((event) =>
      parseEventPayload(event.payload)?.values.DI === pcbSerialNumber
    );
    if (!signal) {
      eventCache.set(cacheKey, { value: events, expiresAt: Date.now() + EVENT_CACHE_MS });
    }
    return events;
  })();

  if (!forceRefresh && !signal) eventRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (eventRequests.get(cacheKey) === request) eventRequests.delete(cacheKey);
  }
}

export async function fetchStatusEventsForPCB(pcbSerialNumber, signal) {
  const events = await fetchDeviceEvents(pcbSerialNumber, 100, signal, {
    forceRefresh: true,
  });
  return events
    .map((event) => ({ ...event, parsed: parseEventPayload(event.payload) }))
    .filter((event) => event.parsed?.batchType === "Batch 3");
}

export async function fetchSegregatedDeviceData(pcbSerialNumber, signal) {
  const [events, connectivityMap] = await Promise.all([
    fetchDeviceEvents(pcbSerialNumber, 100, signal),
    fetchConnectivityMap().catch(() => new Map()),
  ]);
  return reduceEventsToDeviceSnapshot(
    events,
    pcbSerialNumber,
    connectivityMap.get(pcbSerialNumber) || { is_online: false }
  );
}

export async function fetchAllDevicesSegregatedData(serviceItems) {
  const connectivityMap = await fetchConnectivityMap().catch(() => new Map());
  const snapshots = await Promise.all(
    serviceItems.map(async (item) => {
      if (!item.pcb_serial_number) return null;
      try {
        const events = await fetchDeviceEvents(item.pcb_serial_number);
        return {
          ...reduceEventsToDeviceSnapshot(
            events,
            item.pcb_serial_number,
            connectivityMap.get(item.pcb_serial_number) || { is_online: false }
          ),
          service_item_id: item.service_item_id,
        };
      } catch {
        return null;
      }
    })
  );
  return snapshots.filter(Boolean);
}