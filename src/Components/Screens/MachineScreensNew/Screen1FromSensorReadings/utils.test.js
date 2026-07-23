import { getOnlineStatusForItem } from "./utils";

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
