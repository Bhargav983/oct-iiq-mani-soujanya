import {
  clearEventServiceCaches,
  decodeDeviceStatus,
  deviceStatusToPower,
  eventMatchesCommand,
  fetchConnectivityMap,
  fetchDeviceEvents,
  fetchStatusEventsForPCB,
  parseEventPayload,
  reduceEventsToDeviceSnapshot,
  scaleEventValue,
} from "./deviceEventsService";

const batch1 = {
  id: 64698,
  created_at: "22-07-2026 16:01:36",
  payload:
    "0xA1,DI:2507GM0294,ODT:410,INDT:1470,AST:400,ODH:18,INDH:80,INPC:0,DPC:0,RT:424,RH:26,TDS:0,WPL:22494,0xZA",
};

const batch3 = {
  id: 64697,
  created_at: "22-07-2026 16:01:29",
  payload: "0xA3,DI:2507GM0294,FS:2,MD:4,AMD:0,TAS:98,DS:34,LEU:1,SRT:25,EC:0,0xZA",
};

test("parses and validates an event payload", () => {
  expect(parseEventPayload(batch3.payload)).toEqual({
    batchType: "Batch 3",
    values: {
      DI: "2507GM0294",
      FS: "2",
      MD: "4",
      AMD: "0",
      TAS: "98",
      DS: "34",
      LEU: "1",
      SRT: "25",
      EC: "0",
    },
  });
  expect(parseEventPayload("broken,payload")).toBeNull();
  expect(parseEventPayload("0xA3,FS:2,0xZA")).toBeNull();
});

test("uses the backend scaling rules", () => {
  expect(scaleEventValue("ODT", "410")).toBe(41);
  expect(scaleEventValue("RT", "424")).toBe(42.4);
  expect(scaleEventValue("RH", "26")).toBe(26);
  expect(scaleEventValue("ODT", "invalid")).toBeNull();
});

test("maps DS zero to off and every nonzero value to on", () => {
  expect(deviceStatusToPower("0")).toBe(0);
  expect(deviceStatusToPower("56")).toBe(1);
  expect(deviceStatusToPower("invalid")).toBeNull();
});

test("decodes DS as independent flags rather than a power boolean", () => {
  expect(decodeDeviceStatus("34")).toEqual({
    EOF: 0,
    HORB: 1,
    HPHF: 0,
    CDF: 0,
    HPC: 0,
    HPS: 1,
    ISOC: 0,
  });
});

test("merges the latest A1 and A3 packets into one device snapshot", () => {
  const snapshot = reduceEventsToDeviceSnapshot(
    [batch3, batch1],
    "2507GM0294",
    { is_online: true, last_seen: "now" }
  );

  expect(snapshot.outdoor_temperature.value).toBe("41");
  expect(snapshot.room_temperature.value).toBe("42.4");
  expect(snapshot.room_humidity.value).toBe("26");
  expect(snapshot.fan_speed.value).toBe("2");
  expect(snapshot.mode.value).toBe("4");
  expect(snapshot.set_temperature.value).toBe("25");
  expect(snapshot.hvac_on.value).toBe("1");
  expect(snapshot.latest_status_event_id).toBe(64697);
});

test("ignores another PCB and confirms commands from mapped A3 fields", () => {
  const wrongDevice = { ...batch1, id: 99999, payload: batch1.payload.replace("2507GM0294", "OTHER") };
  const snapshot = reduceEventsToDeviceSnapshot([wrongDevice, batch1, batch3], "2507GM0294");
  expect(snapshot.latest_event_id).toBe(64698);

  const parsed = parseEventPayload(batch3.payload);
  expect(eventMatchesCommand(parsed, { MD: "4", FS: "2", SRT: "25", HVAC: "1" })).toBe(true);
  expect(eventMatchesCommand(parsed, { MD: "3" })).toBe(false);
  expect(
    eventMatchesCommand(parsed, {
      MD: "3",
      FS: "0",
      SRT: "18",
      HVAC: "1",
      confirmationFields: ["DS"],
    })
  ).toBe(true);
  expect(
    eventMatchesCommand(parsed, { HVAC: "0", confirmationFields: ["DS"] })
  ).toBe(false);
});

test("confirms an off command when DS becomes zero", () => {
  const offEvent = parseEventPayload(
    "0xA3,DI:2507GM0294,FS:2,MD:4,DS:0,LEU:1,SRT:25,EC:0,0xZA"
  );
  expect(
    eventMatchesCommand(offEvent, { HVAC: "0", confirmationFields: ["DS"] })
  ).toBe(true);
});

afterEach(() => {
  clearEventServiceCaches();
  jest.restoreAllMocks();
});

test("reuses connectivity and event requests during startup", async () => {
  const connectivityResponse = {
    ok: true,
    json: async () => [{ pcb_serial_number: "2507GM0294", is_online: true }],
  };
  const eventsResponse = { ok: true, json: async () => [batch1, batch3] };
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(connectivityResponse)
    .mockResolvedValueOnce(eventsResponse);

  const [connectivityA, connectivityB] = await Promise.all([
    fetchConnectivityMap(),
    fetchConnectivityMap(),
  ]);
  const [eventsA, eventsB] = await Promise.all([
    fetchDeviceEvents("2507GM0294"),
    fetchDeviceEvents("2507GM0294"),
  ]);

  expect(connectivityA).toBe(connectivityB);
  expect(eventsA).toBe(eventsB);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test("command confirmation bypasses the short event cache", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [batch3],
  });

  await fetchDeviceEvents("2507GM0294");
  await fetchStatusEventsForPCB("2507GM0294");

  expect(global.fetch).toHaveBeenCalledTimes(2);
});