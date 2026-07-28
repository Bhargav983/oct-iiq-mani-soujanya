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

export const findDeviceDataForItem = (item, allDevicesData) => {
  if (!Array.isArray(allDevicesData) || !item) return null;
  return (
    allDevicesData.find(
      (device) =>
        device.service_item_id === item.service_item_id ||
        device.pcb_serial_number === item.pcb_serial_number
    ) || null
  );
};

const unwrapValue = (value) =>
  value && typeof value === "object" && "value" in value ? value.value : value;

export const isActiveDeviceValue = (value) => {
  const normalized = unwrapValue(value);
  if (normalized == null || normalized === false) return false;
  if (typeof normalized === "number") return normalized !== 0;
  if (typeof normalized === "boolean") return normalized;

  const text = String(normalized).trim().toLowerCase();
  if (!text || ["0", "false", "null", "undefined", "no"].includes(text)) {
    return false;
  }
  const numericValue = Number(text);
  return Number.isNaN(numericValue) ? true : numericValue !== 0;
};


export const getOnlineStatusForItem = (item, allDevicesData) => {
  const deviceData = findDeviceDataForItem(item, allDevicesData);
  if (!deviceData) return null;
  const onlineValue = unwrapValue(deviceData.is_online);
  if (onlineValue == null) return null;
  return isActiveDeviceValue(onlineValue);
};

export const getAlarmCountForItem = (item, allDevicesData) => {
  const deviceData = findDeviceDataForItem(item, allDevicesData);
  if (!deviceData || getOnlineStatusForItem(item, allDevicesData) !== true) {
    return 0;
  }
  const alarmValue = unwrapValue(deviceData.alarm_occurred);
  const count = Number(alarmValue);
  return Number.isFinite(count) && count > 0 ? count : 0;
};

export const getLiveAlarmTotal = (items, allDevicesData) =>
  Array.isArray(items)
    ? items.reduce(
        (total, item) => total + getAlarmCountForItem(item, allDevicesData),
        0
      )
    : 0;

export const getMachineStatusForItem = (item, allDevicesData) => {
  const deviceData = findDeviceDataForItem(item, allDevicesData);
  if (!deviceData) return "checking";

  const isOnline = getOnlineStatusForItem(item, allDevicesData);
  if (isOnline === false) return "offline";
  if (isOnline !== true) return "checking";

  if (
    isActiveDeviceValue(deviceData.error_flag) ||
    isActiveDeviceValue(deviceData.alarm_occurred)
  ) {
    return "error";
  }

  return "online";
};

export const mapDeviceSnapshotToScreenState = (deviceData, pcbSerialNumber) => {
  if (!deviceData) return null;
  const isOnline = Boolean(deviceData.is_online);
  const sensorData = {
    outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
    humidity: isOnline ? deviceData.room_humidity?.value : null,
    roomTemp: isOnline ? deviceData.room_temperature?.value : null,
    fanSpeed: isOnline ? deviceData.fan_speed?.value ?? "0" : "0",
    temperature: isOnline ? deviceData.set_temperature?.value ?? 25 : 25,
    powerStatus:
      isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
    mode: deviceData.mode?.value || "3",
    errorFlag: isOnline ? deviceData.error_flag?.value || "0" : "0",
    hvacBusy: isOnline ? deviceData.hvac_busy?.value || "0" : "0",
    deviceId: pcbSerialNumber,
    alarmOccurred: deviceData.alarm_occurred?.value || "0",
    isOnline,
  };

  return {
    sensorData,
    displayData: {
      fanSpeed: sensorData.fanSpeed,
      temperature: sensorData.temperature,
      mode: sensorData.mode,
      powerStatus: sensorData.powerStatus,
    },
    errorCount:
      sensorData.alarmOccurred !== "0"
        ? Number(sensorData.alarmOccurred) || 0
        : 0,
  };
};

export const upsertDeviceSnapshot = (
  snapshots,
  deviceData,
  serviceItemId
) => {
  if (!deviceData) return Array.isArray(snapshots) ? snapshots : [];
  const current = Array.isArray(snapshots) ? snapshots : [];
  const nextSnapshot = {
    ...deviceData,
    service_item_id: serviceItemId || deviceData.service_item_id,
  };
  return [
    ...current.filter(
      (snapshot) =>
        snapshot.service_item_id !== nextSnapshot.service_item_id &&
        snapshot.pcb_serial_number !== nextSnapshot.pcb_serial_number
    ),
    nextSnapshot,
  ];
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