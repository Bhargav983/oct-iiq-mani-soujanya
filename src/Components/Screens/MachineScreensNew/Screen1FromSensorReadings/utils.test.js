import {
  getAlarmCountForItem,
  getLiveAlarmTotal,
  getMachineStatusForItem,
  mapDeviceSnapshotToScreenState,
  upsertDeviceSnapshot,
  getOnlineStatusForItem,
} from "./utils";

const service = {
  service_item_id: "SER1",
  pcb_serial_number: "2507GM0294",
};

test("maps service items to online, offline, and unknown states", () => {
  expect(
    getOnlineStatusForItem(service, [
      { service_item_id: "SER1", is_online: true },
    ])
  ).toBe(true);
  expect(
    getOnlineStatusForItem(service, [
      { pcb_serial_number: "2507GM0294", is_online: false },
    ])
  ).toBe(false);
  expect(getOnlineStatusForItem(service, [])).toBeNull();
});

test("shows errors only while the machine is online", () => {
  expect(
    getMachineStatusForItem(service, [
      { service_item_id: "SER1", is_online: true, error_flag: { value: "1" } },
    ])
  ).toBe("error");
  expect(
    getMachineStatusForItem(service, [
      { service_item_id: "SER1", is_online: false, alarm_occurred: 2 },
    ])
  ).toBe("offline");
});

test("suppresses stale alarm badges for offline and unknown machines", () => {
  const offline = { ...service, service_item_id: "OFFLINE" };
  const unknown = { ...service, service_item_id: "UNKNOWN" };
  const online = { ...service, service_item_id: "ONLINE" };
  const devices = [
    { service_item_id: "OFFLINE", is_online: false, alarm_occurred: 4 },
    { service_item_id: "UNKNOWN", alarm_occurred: 3 },
    { service_item_id: "ONLINE", is_online: true, alarm_occurred: 2 },
  ];

  expect(getAlarmCountForItem(offline, devices)).toBe(0);
  expect(getAlarmCountForItem(unknown, devices)).toBe(0);
  expect(getAlarmCountForItem(online, devices)).toBe(2);
  expect(getLiveAlarmTotal([offline, unknown, online], devices)).toBe(2);
});

test("maps clear machines to online, offline, and checking", () => {
  expect(
    getMachineStatusForItem(service, [
      { service_item_id: "SER1", is_online: "true", error_flag: "0" },
    ])
  ).toBe("online");
  expect(
    getMachineStatusForItem(service, [
      { service_item_id: "SER1", is_online: "false", alarm_occurred: { value: "0" } },
    ])
  ).toBe("offline");
  expect(getMachineStatusForItem(service, [])).toBe("checking");
});

test("matches by PCB and normalizes alarm counts", () => {
  const devices = [
    {
      pcb_serial_number: "2507GM0294",
      is_online: 1,
      error_flag: false,
      alarm_occurred: { value: "3" },
    },
  ];
  expect(getMachineStatusForItem(service, devices)).toBe("error");
  expect(getAlarmCountForItem(service, devices)).toBe(3);
});

test("returns to connectivity status after an error clears", () => {
  expect(
    getMachineStatusForItem(service, [
      {
        service_item_id: "SER1",
        is_online: true,
        error_flag: { value: "0" },
        alarm_occurred: { value: "0" },
      },
    ])
  ).toBe("online");
});
test("maps a cached device snapshot to screen state", () => {
  const mapped = mapDeviceSnapshotToScreenState(
    {
      is_online: true,
      room_temperature: { value: "24.5" },
      outdoor_temperature: { value: "31.2" },
      room_humidity: { value: "55" },
      fan_speed: { value: "2" },
      set_temperature: { value: "23" },
      hvac_on: { value: "1" },
      mode: { value: "3" },
      error_flag: { value: "1" },
      alarm_occurred: { value: "1" },
    },
    "2507GM0294"
  );

  expect(mapped.sensorData.deviceId).toBe("2507GM0294");
  expect(mapped.sensorData.roomTemp).toBe("24.5");
  expect(mapped.displayData.fanSpeed).toBe("2");
  expect(mapped.displayData.powerStatus).toBe("on");
  expect(mapped.errorCount).toBe(1);
});

test("upserts snapshots by PCB without changing other units", () => {
  const updated = upsertDeviceSnapshot(
    [
      { service_item_id: "SER1", pcb_serial_number: "PCB1", marker: "old" },
      { service_item_id: "SER2", pcb_serial_number: "PCB2", marker: "keep" },
    ],
    { pcb_serial_number: "PCB1", marker: "fresh" },
    "SER1"
  );

  expect(updated).toHaveLength(2);
  expect(updated.find((item) => item.pcb_serial_number === "PCB1").marker).toBe("fresh");
  expect(updated.find((item) => item.pcb_serial_number === "PCB2").marker).toBe("keep");
});
