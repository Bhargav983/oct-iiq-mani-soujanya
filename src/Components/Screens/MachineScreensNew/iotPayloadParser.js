// src/Components/Screens/MachineScreensNew/iotPayloadParser.js

const SCALING_RULES = {
  "ODT": 10, "INDT": 10, "AST": 10, "RT": 10,
  "INPC": 10, "DPC": 10, "P1C": 10, "P2C": 10, "P3C": 10,
  "P1KW": 100, "P2KW": 100, "P3KW": 100, "TP": 100
};

const DS_FLAGS = {
  "EOF": 0, "HORB": 1, "HPHF": 2, "CDF": 3, "HPC": 4, "HPS": 5, "ISOC": 6
};

/**
 * Parses raw IoT event payloads matching the backend IoT_Event_Processing_Logic.pdf rules.
 * Extracts sensor values, scaling rules, status flags (DS), and error codes (EC).
 */
export const parseRawPayload = (rawPayload, eventId, createdAt) => {
  if (!rawPayload || typeof rawPayload !== 'string') return null;

  const parts = rawPayload.trim().split(',');
  let deviceId = null;
  let batchType = null;
  const dataPoints = {};
  const flags = {};

  for (const part of parts) {
    if (part.startswith("DI:")) {
      deviceId = part.split(':')[1];
    } else if (part.startsWith("0xA1")) {
      batchType = 'Batch 1';
    } else if (part.startsWith("0xA2")) {
      batchType = 'Batch 2';
    } else if (part.startsWith("0xA3")) {
      batchType = 'Batch 3';
    } else if (part.includes(":") && !part.startsWith("0x")) {
      const [key, val] = part.split(':', 2);
      const k = key.trim();
      const v = val.trim();
      dataPoints[k] = v;

      // Apply scaling rules matching backend tasks.py
      if (SCALING_RULES[k]) {
        try {
          const num = parseFloat(v) / SCALING_RULES[k];
          dataPoints[k] = num.toFixed(1);
        } catch (e) {
          dataPoints[k] = v;
        }
      }
    }
  }

  // Parse Device Status (DS) bitmask if present (Batch 3)
  if (dataPoints['DS'] !== undefined) {
    try {
      const dsInt = parseInt(dataPoints['DS'], 10);
      for (const [flagCode, bitPos] of Object.entries(DS_FLAGS)) {
        flags[flagCode] = (dsInt >> bitPos) & 1;
      }
    } catch (e) {}
  }

  // Extract Error Code (EC)
  const ecVal = dataPoints['EC'] !== undefined ? parseInt(dataPoints['EC'], 10) : 0;

  return {
    event_id: eventId,
    created_at: createdAt,
    device_id: deviceId,
    batch_type: batchType,
    outdoor_temperature: dataPoints['ODT'] || null,
    room_temperature: dataPoints['RT'] || null,
    room_humidity: dataPoints['RH'] || null,
    set_temperature: dataPoints['TAS'] || dataPoints['ST'] || null,
    mode: dataPoints['MD'] || null,
    fan_speed: dataPoints['FS'] || null,
    hvac_busy: dataPoints['AMD'] || "0",
    error_code: ecVal,
    error_flag: ecVal > 0 ? "1" : "0",
    alarm_occurred: dataPoints['LEU'] !== undefined ? String(dataPoints['LEU']) : (ecVal > 0 ? "1" : "0"),
    flags,
    raw_data: rawPayload
  };
};

/**
 * Reduces a list of raw event objects for a specific PCB serial number into a unified live device snapshot.
 */
export const reduceEventsToLiveSnapshot = (events, pcbSerialNumber) => {
  if (!Array.isArray(events) || events.length === 0) return null;

  // Filter events matching the device ID / PCB serial number
  const deviceEvents = events.filter(ev => {
    const payload = ev.payload || "";
    return payload.includes(`DI:${pcbSerialNumber}`);
  });

  if (deviceEvents.length === 0) return null;

  // Sort chronologically by ID
  deviceEvents.sort((a, b) => (a.id || 0) - (b.id || 0));

  // Parse the latest event as primary snapshot source
  const latestEvent = deviceEvents[deviceEvents.length - 1];
  const parsed = parseRawPayload(latestEvent.payload, latestEvent.id, latestEvent.created_at);

  if (!parsed) return null;

  return {
    deviceId: pcbSerialNumber,
    isOnline: true,
    temperature: parsed.set_temperature || "25",
    roomTemp: parsed.room_temperature || "0.0",
    outsideTemp: parsed.outdoor_temperature || "0.0",
    humidity: parsed.room_humidity || "0",
    mode: parsed.mode || "3",
    fanSpeed: parsed.fan_speed || "0",
    powerStatus: parsed.hvac_busy === "1" ? "on" : "off",
    hvacBusy: parsed.hvac_busy || "0",
    errorFlag: parsed.error_flag,
    errorCode: String(parsed.error_code),
    alarmOccurred: parsed.alarm_occurred,
    latestEventId: parsed.event_id,
    latestPayload: parsed.raw_data
  };
};
