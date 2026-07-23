import {
  getDelegatePermissions,
  normalizeDelegateAssignments,
} from "./delegateAssignments";

test("keeps only active monitorable assignments for the signed-in delegate", () => {
  const assignments = [
    { item_id: "1", delegate: "D-1", service_item: "S-1", can_monitor_equipment: true, can_control_equipment: false, completed_at: null },
    { item_id: "2", delegate: "D-1", service_item: "S-2", can_monitor_equipment: false, completed_at: null },
    { item_id: "3", delegate: "D-2", service_item: "S-3", can_monitor_equipment: true, completed_at: null },
    { item_id: "4", delegate: "D-1", service_item: "S-4", can_monitor_equipment: true, completed_at: "done" },
  ];
  const details = {
    "S-1": { service_item_name: "View Unit", pcb_serial_number: "PCB-1" },
  };

  expect(normalizeDelegateAssignments(assignments, details, "D-1")).toEqual([
    expect.objectContaining({
      service_item_id: "S-1",
      service_item_name: "View Unit",
      pcb_serial_number: "PCB-1",
      permissions: expect.objectContaining({ can_control_equipment: false }),
    }),
  ]);
});

test("exposes permissions from the selected normalized service item", () => {
  expect(getDelegatePermissions({ permissions: { can_control_equipment: true } })).toEqual({ can_control_equipment: true });
  expect(getDelegatePermissions(null)).toEqual({});
});