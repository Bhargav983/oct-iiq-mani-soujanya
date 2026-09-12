import {
  answerMachineQuestionLocally,
  getFanSpeedLabel,
  getModeLabel,
  hasMachineError,
} from "./machineAssistant";

const machineData = {
  pcb_serial_number: "1234567890",
  service_item_id: "SI001",
  set_temperature: 25,
  room_temperature: 0,
  outdoor_temperature: 0,
  room_humidity: 0,
  mode: "3",
  fan_speed: "0",
  error_flag: "0",
  error_code: "0",
  alarm_occurred: "0",
  power_status: "off",
  is_online: false,
  last_updated: "2026-09-08T08:34:46.961Z",
};

test("answers a current status question locally with zero values preserved", () => {
  const answer = answerMachineQuestionLocally(
    "What is current status of the machine?",
    machineData
  );

  expect(answer).toContain("Power Status: off");
  expect(answer).toContain("Online Status: Offline");
  expect(answer).toContain("Room Temperature: 0°C");
  expect(answer).toContain("Room Humidity: 0%");
  expect(answer).toContain("Mode: Fan");
  expect(answer).toContain("Fan Speed: High");
  expect(answer).toContain("No errors or alarms");
});

test("answers common parameter questions without using the AI fallback", () => {
  expect(answerMachineQuestionLocally("What is the humidity?", machineData)).toBe(
    "Current room humidity: 0%"
  );
  expect(answerMachineQuestionLocally("Is the machine online?", machineData)).toBe(
    "The machine is currently offline."
  );
  expect(getModeLabel("3")).toBe("Fan");
  expect(getFanSpeedLabel("0")).toBe("High");
});

test("detects non-zero error and alarm fields", () => {
  expect(hasMachineError(machineData)).toBe(false);
  expect(hasMachineError({ ...machineData, error_code: "24" })).toBe(true);
});

test("uses Gemini fallback for explanatory questions", () => {
  expect(
    answerMachineQuestionLocally("Why is my machine offline?", machineData)
  ).toBeNull();
  expect(
    answerMachineQuestionLocally("How can I improve cooling?", machineData)
  ).toBeNull();
});

