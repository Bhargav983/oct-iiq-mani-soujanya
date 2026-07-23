export const normalizeDelegateAssignments = (
  assignments = [],
  serviceItemDetails = {},
  delegateId
) =>
  assignments
    .filter(
      (assignment) =>
        assignment?.delegate === delegateId &&
        assignment?.can_monitor_equipment === true &&
        !assignment?.completed_at
    )
    .map((assignment) => {
      const details = serviceItemDetails[assignment.service_item] || {};
      return {
        ...details,
        service_item_id: assignment.service_item,
        service_item_name:
          details.service_item_name || assignment.service_item,
        pcb_serial_number:
          details.pcb_serial_number || assignment.pcb_serial_number || "",
        delegate_assignment_id: assignment.item_id,
        permissions: {
          can_monitor_equipment: assignment.can_monitor_equipment === true,
          can_control_equipment: assignment.can_control_equipment === true,
          can_raise_service_request:
            assignment.can_raise_service_request === true,
          can_submit_customer_satisfaction_survey:
            assignment.can_submit_customer_satisfaction_survey === true,
          can_log_customer_complaints:
            assignment.can_log_customer_complaints === true,
        },
      };
    });

export const getDelegatePermissions = (serviceItem) =>
  serviceItem?.permissions || {};