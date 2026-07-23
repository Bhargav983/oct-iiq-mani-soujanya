export const getStoredService = () => {
  try {
    const stored = localStorage.getItem("selectedService");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const formatTemp = (temp) => {
  if (temp == null) return "0.0";
  const num = parseFloat(temp);
  return Number.isNaN(num) ? "0.0" : num.toFixed(1);
};

export const getAlarmCountForItem = (item, allDevicesData) => {
  if (!allDevicesData || !item) return 0;
  const deviceData = allDevicesData.find(
    (device) => device.service_item_id === item.service_item_id
  );
  if (!deviceData) return 0;
  const alarmValue = deviceData.alarm_occurred?.value;
  return alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0;
};

export const getOnlineStatusForItem = (item, allDevicesData) => {
  if (!Array.isArray(allDevicesData) || !item) return null;
  const deviceData = allDevicesData.find(
    (device) =>
      device.service_item_id === item.service_item_id ||
      device.pcb_serial_number === item.pcb_serial_number
  );
  return deviceData ? Boolean(deviceData.is_online) : null;
};

export const selectDeviceData = (data, pcbSerialNumber, serviceItemId) => {
  if (!data) return null;
  if (!Array.isArray(data)) return data;

  const expectedPCB = String(pcbSerialNumber || "");
  const expectedServiceItemId = String(serviceItemId || "");

  const match = data.find((item) => {
    const itemPCB =
      item?.pcb_serial_number ??
      item?.device_id ??
      item?.deviceId ??
      item?.DI ??
      item?.di;

    return (
      (expectedPCB && String(itemPCB || "") === expectedPCB) ||
      (expectedServiceItemId &&
        String(item?.service_item_id || "") === expectedServiceItemId)
    );
  });

  return match || (data.length === 1 ? data[0] : null);
};