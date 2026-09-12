import { FAN_LABELS, MODE_MAP } from "../constants";

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const displayValue = (value, fallback = "Not available") =>
  hasValue(value) ? String(value) : fallback;

const asBoolean = (value) => value === true || String(value).toLowerCase() === "true";

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const withUnit = (value, unit) =>
  hasValue(value) ? `${displayValue(value)}${unit}` : "Not available";

export const getModeLabel = (value) => MODE_MAP[Number(value)] || displayValue(value);

export const getFanSpeedLabel = (value) =>
  FAN_LABELS[Number(value)] || displayValue(value);

export const hasMachineError = (machineData) =>
  asNumber(machineData.error_flag) !== 0 ||
  asNumber(machineData.error_code) !== 0 ||
  asNumber(machineData.alarm_occurred) !== 0;

const statusSummary = (machineData) => {
  const errorSummary = hasMachineError(machineData)
    ? `Detected (Error Flag: ${displayValue(machineData.error_flag, "0")}, Error Code: ${displayValue(machineData.error_code, "0")}, Alarm Occurred: ${displayValue(machineData.alarm_occurred, "0")})`
    : "No errors or alarms";

  return [
    "Here is the current status summary of the machine:",
    "",
    `- Power Status: ${displayValue(machineData.power_status)}`,
    `- Online Status: ${asBoolean(machineData.is_online) ? "Online" : "Offline"}`,
    `- Set Temperature: ${withUnit(machineData.set_temperature, "°C")}`,
    `- Room Temperature: ${withUnit(machineData.room_temperature, "°C")}`,
    `- Outdoor Temperature: ${withUnit(machineData.outdoor_temperature, "°C")}`,
    `- Room Humidity: ${withUnit(machineData.room_humidity, "%")}`,
    `- Mode: ${getModeLabel(machineData.mode)}`,
    `- Fan Speed: ${getFanSpeedLabel(machineData.fan_speed)}`,
    `- Errors / Alarms: ${errorSummary}`,
    `- PCB Serial Number: ${displayValue(machineData.pcb_serial_number)}`,
    `- Service Item ID: ${displayValue(machineData.service_item_id)}`,
    `- Last Updated: ${displayValue(machineData.last_updated)}`,
  ].join("\n");
};

const simpleIntent = (question) => {
  const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  if (/\b(current|machine|unit|device)\s+(status|summary)\b|\bstatus\s+of\s+(the\s+)?(machine|unit|device)\b/.test(normalized)) return "status";
  if (/\b(error|errors|alarm|alarms|fault|faults)\b/.test(normalized) && !/\b(why|explain|fix|solve|cause|meaning)\b/.test(normalized)) return "errors";
  if (/\b(humidity)\b/.test(normalized)) return "humidity";
  if (/\b(temperature|temp)\b/.test(normalized) && !/\b(why|recommend|ideal|change|set|increase|decrease)\b/.test(normalized)) return "temperature";
  if (/\b(fan speed|fan)\b/.test(normalized) && !/\b(why|change|set|increase|decrease)\b/.test(normalized)) return "fan";
  if (/\b(mode)\b/.test(normalized) && !/\b(why|change|set)\b/.test(normalized)) return "mode";
  if (/\b(online|offline|connectivity|connected)\b/.test(normalized) && !/\b(why|fix|cause)\b/.test(normalized)) return "online";
  if (/\b(power|on or off|switched on|switched off)\b/.test(normalized) && !/\b(why|turn|switch|change)\b/.test(normalized)) return "power";
  if (/\b(pcb|serial|service item|device id|machine id)\b/.test(normalized)) return "identity";
  if (/\b(last updated|updated time|data time|timestamp)\b/.test(normalized)) return "updated";
  return null;
};

export const answerMachineQuestionLocally = (question, machineData) => {
  if (!question || !machineData) return null;

  switch (simpleIntent(question)) {
    case "status":
      return statusSummary(machineData);
    case "temperature":
      return `Set temperature: ${withUnit(machineData.set_temperature, "°C")}\nRoom temperature: ${withUnit(machineData.room_temperature, "°C")}\nOutdoor temperature: ${withUnit(machineData.outdoor_temperature, "°C")}`;
    case "humidity":
      return `Current room humidity: ${withUnit(machineData.room_humidity, "%")}`;
    case "fan":
      return `Current fan speed: ${getFanSpeedLabel(machineData.fan_speed)}`;
    case "mode":
      return `Current mode: ${getModeLabel(machineData.mode)}`;
    case "online":
      return `The machine is currently ${asBoolean(machineData.is_online) ? "online" : "offline"}.`;
    case "power":
      return `Power status: ${displayValue(machineData.power_status)}`;
    case "identity":
      return `PCB serial number: ${displayValue(machineData.pcb_serial_number)}\nService item ID: ${displayValue(machineData.service_item_id)}`;
    case "updated":
      return `Machine data was last updated at ${displayValue(machineData.last_updated)}.`;
    case "errors":
      return hasMachineError(machineData)
        ? `An error or alarm is active. Error flag: ${displayValue(machineData.error_flag, "0")}, error code: ${displayValue(machineData.error_code, "0")}, alarm occurred: ${displayValue(machineData.alarm_occurred, "0")}.`
        : "There are currently no machine errors or alarms.";
    default:
      return null;
  }
};

