import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import "../Screen1.css";
import AIROlogo from "../Images/AIRO.png";
import greenAire from "../Images/greenAire.png";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../AuthContext/AuthContext";
import TemperatureDial from "../TemperatureDial";
import baseURL from "../../../ApiUrl/Apiurl";
import NoServiceItems from "../NoServiceItems";
import Loading from "../Loading";
import ActionMenu from "../Screen1FromSensorReadings/components/ActionMenu";
import ConfirmationDialog from "../Screen1FromSensorReadings/components/ConfirmationDialog";
import EnvironmentReadings from "../Screen1FromSensorReadings/components/EnvironmentReadings";
import MachineControls from "../Screen1FromSensorReadings/components/MachineControls";
import MachineHeader from "../Screen1FromSensorReadings/components/MachineHeader";
import PullToRefreshStatus from "../Screen1FromSensorReadings/components/PullToRefreshStatus";
import ServiceSwitchOverlay from "../Screen1FromSensorReadings/components/ServiceSwitchOverlay";
import {
  FAN_SPEEDS,
  MAX_PULL,
  MODE_CODE_MAP,
  MODE_MAP,
  PROCESSING_MESSAGES,
  PULL_THRESHOLD,
  SWITCHING_MESSAGES,
} from "../Screen1FromSensorReadings/constants";
import { sendRefreshCommand } from "../Screen1FromSensorReadings/controllerApi";
import { getStoredService } from "../Screen1FromSensorReadings/utils";
import {
  eventMatchesCommand,
  fetchAllDevicesSegregatedData,
  fetchSegregatedDeviceData,
  fetchStatusEventsForPCB,
} from "../deviceEventsService";
import {
  fetchCustomerServiceItems,
  getCachedCustomerServiceItems,
} from "../serviceItemsService";

const COMMAND_CONFIRMATION_TIMEOUT_MS = 300000;
const COMMAND_CONFIRMATION_POLL_MS = 2000;
const COMMAND_CANCEL_DELAY_MS = 60000;
const INITIALIZATION_RETRY_DELAYS_MS = [0, 5000, 10000, 20000, 30000];

const Screen1FromEvents = () => {
  const { user, logout } = useContext(AuthContext);
  const userId = user?.customer_id;
  const company_id = user?.company_id;
  const navigate = useNavigate();

  const [showTempConfirmDialog, setShowTempConfirmDialog] = useState(false);
  const [pendingTemperature, setPendingTemperature] = useState(null);

  const [pullToRefresh, setPullToRefresh] = useState({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  });

  const touchStartY = useRef(0);
  const isFetchingRef = useRef(false);
const hasStoppedRef = useRef(false); // prevents clearProcessingIfDone from firing stopProcessing more than once per cycle
  const containerRef = useRef(null);
  const processingPollRef = useRef(null);
  // add near your other refs
const processingRef = useRef(false);

  const activePCBRef = useRef(null);
  const lastStatusEventIdRef = useRef(null);
  const commandBaselineEventIdRef = useRef(null);
  const pendingCommandRef = useRef(null);
  const eventAbortRef = useRef(null);
  const fetchIntervalRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const initialAlarmTimerRef = useRef(null);

  const processingTimerRef = useRef(null);
  const processingMsgIndexRef = useRef(0);
  const commandTimeoutRef = useRef(null);
  const cancelAvailabilityTimerRef = useRef(null);

  const [serviceItems, setServiceItems] = useState([]);
  const [selectedService, setSelectedService] = useState(getStoredService());
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [processing, setProcessing] = useState({ status: false, message: "" });
  const [canCancelProcessing, setCanCancelProcessing] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initializationRun, setInitializationRun] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState({
    phase: "connecting",
    title: "Connecting to AIR₂O services",
    message: "Please wait while we load your machines.",
  });
  const [manualRefresh, setManualRefresh] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState({
    sending: false,
    success: false,
    message: "",
  });
  const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false); // ✅ NEW: Track initial data loads

  const processingStartTimeRef = useRef(null);
const [allDevicesData, setAllDevicesData] = useState([]);
  const [sensorData, setSensorData] = useState({
    outsideTemp: 0,
    humidity: 0,
    roomTemp: 0,
    fanSpeed: "0",
    temperature: 25,
    powerStatus: "off",
    mode: "3",
    errorFlag: "0",
    hvacBusy: "0",
    deviceId: "",
    alarmOccurred: "0",
    isOnline: false,
  });

  // keep it in sync with state
useEffect(() => {
  processingRef.current = processing.status;
}, [processing.status]);

  // Add this after your sensorData state declaration
const isControlDisabled = () => {
  // Disable if processing is happening
  if (processing.status) return true;
  
  // Disable if device is offline
  if (!sensorData.isOnline) return true;
  
  // Disable if error flag is 1
  if (sensorData.errorFlag === "1") return true;
  
  // Disable if HVAC is busy
  if (sensorData.hvacBusy === "1") return true;
  
  return false;
};

  const [displayData, setDisplayData] = useState({
    fanSpeed: "0",
    temperature: 25,
    mode: "3",
    powerStatus: "off",
  });

  const [, setIsDraggingTemp] = useState(false);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingService, setPendingService] = useState(null);
  const [switchingService, setSwitchingService] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [switchNotification, setSwitchNotification] = useState({ show: false, message: "" });
  const [switchingProgress, setSwitchingProgress] = useState(0);

  useEffect(() => {
    setDisplayData({
      fanSpeed: sensorData.fanSpeed,
      temperature: sensorData.temperature,
      mode: sensorData.mode,
      powerStatus: sensorData.powerStatus,
    });
  }, [sensorData]);

  useEffect(() => {
    if (selectedService) {
      localStorage.setItem("selectedService", JSON.stringify(selectedService));
    }
  }, [selectedService]);

  const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
  const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

  // Build one device snapshot directly from its latest A1/A3 events.
  const fetchDataForPCB = async (pcbSerialNumber) => {
    try {
      const deviceData = await fetchSegregatedDeviceData(pcbSerialNumber);
      if (deviceData?.latest_status_event_id != null) {
        lastStatusEventIdRef.current = deviceData.latest_status_event_id;
      }
      return deviceData;
    } catch (error) {
      console.error(`Event snapshot fetch failed for ${pcbSerialNumber}:`, error);
      return null;
    }
  };
  // Fetch service items with patient-facing status and bounded automatic retries.
  useEffect(() => {
    let cancelled = false;
    const timers = new Set();

    const wait = (delay) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          resolve();
        }, delay);
        timers.add(timer);
      });

    const initializeService = async (items, usingCachedItems = false) => {
      if (cancelled) return;
      setServiceItems(items);

      if (items.length === 0) {
        setInitialDataLoaded(true);
        setLoading(false);
        return;
      }

      const first = items[0];
      setSelectedService(first);
      activePCBRef.current = first.pcb_serial_number;
      setLoadingMessage("Loading device data...");
      setLoading(false);

      const deviceData = await fetchDataForPCB(first.pcb_serial_number, first.service_item_id);
      if (cancelled) return;

      if (deviceData) {
        const isOnline = deviceData.is_online;
        setSensorData({
          outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
          humidity: isOnline ? deviceData.room_humidity?.value : null,
          roomTemp: isOnline ? deviceData.room_temperature?.value : null,
          fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
          temperature: isOnline ? deviceData.set_temperature?.value : 25,
          powerStatus: isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
          mode: deviceData.mode?.value || "3",
          errorFlag: isOnline ? deviceData.error_flag?.value : "0",
          hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
          deviceId: first.pcb_serial_number,
          alarmOccurred: deviceData.alarm_occurred?.value || "0",
          isOnline,
        });

        setDisplayData({
          fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
          temperature: isOnline ? deviceData.set_temperature?.value : 25,
          mode: deviceData.mode?.value || "3",
          powerStatus: isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
        });

        const alarmValue = deviceData.alarm_occurred?.value;
        setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
      }

      setInitialDataLoaded(true);
      setPullToRefresh((previous) => ({ ...previous, isRefreshing: false }));
      setManualRefresh(false);

      if (usingCachedItems) {
        setSwitchNotification({
          show: true,
          message: "Using your last available machine list while AIR₂O reconnects.",
        });
        const cachedNoticeTimer = setTimeout(
          () => setSwitchNotification({ show: false, message: "" }),
          5000
        );
        timers.add(cachedNoticeTimer);
      }
    };

    const initialize = async () => {
      setLoading(true);
      setInitialDataLoaded(false);
      setConnectionStatus({
        phase: "connecting",
        title: "Connecting to AIR₂O services",
        message: "Please wait while we load your machines.",
      });

      const slowTimer = setTimeout(() => {
        if (!cancelled) {
          setConnectionStatus((current) =>
            current.phase === "connecting"
              ? {
                  phase: "slow",
                  title: "Still connecting",
                  message:
                    "This is taking a little longer than usual. Your HVAC machine may still be operating normally.",
                }
              : current
          );
        }
      }, 8000);
      timers.add(slowTimer);

      let lastError;
      for (let attempt = 0; attempt < INITIALIZATION_RETRY_DELAYS_MS.length; attempt += 1) {
        if (cancelled) return;

        const delay = INITIALIZATION_RETRY_DELAYS_MS[attempt];
        if (delay > 0) {
          setConnectionStatus({
            phase: "retrying",
            title: "AIR₂O services are taking longer to respond",
            message: `Retrying automatically (attempt ${attempt + 1} of ${INITIALIZATION_RETRY_DELAYS_MS.length})…`,
          });
          await wait(delay);
          if (cancelled) return;
        }

        try {
          const items = await fetchCustomerServiceItems(baseURL, userId, company_id);
          if (cancelled) return;
          timers.forEach(clearTimeout);
          timers.clear();
          await initializeService(items);

          if (attempt > 0 && !cancelled) {
            setSwitchNotification({ show: true, message: "Connection restored. Machine information is up to date." });
            const noticeTimer = setTimeout(
              () => setSwitchNotification({ show: false, message: "" }),
              4000
            );
            timers.add(noticeTimer);
          }
          return;
        } catch (error) {
          lastError = error;
          console.warn(`AIR₂O initialization attempt ${attempt + 1} failed:`, error);
        }
      }

      if (cancelled) return;
      const cachedItems = getCachedCustomerServiceItems(baseURL, userId, company_id);
      if (cachedItems?.length) {
        await initializeService(cachedItems, true);
        return;
      }

      console.error("AIR₂O services remain unavailable after automatic retries:", lastError);
      setLoading(false);
      setConnectionStatus({
        phase: "unavailable",
        title: "Unable to connect right now",
        message:
          "AIR₂O services are temporarily unavailable. Your HVAC machine may still be operating normally. Please retry.",
      });
      setPullToRefresh((previous) => ({ ...previous, isRefreshing: false }));
      setManualRefresh(false);
    };

    initialize();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [userId, company_id, initializationRun]);
  // Foreground event refresh for the active PCB.
  const fetchData = async () => {
    const pcbSerialNumber = activePCBRef.current;
    if (!pcbSerialNumber || isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (eventAbortRef.current) eventAbortRef.current.abort();
    const controller = new AbortController();
    eventAbortRef.current = controller;

    try {
      const deviceData = await fetchSegregatedDeviceData(pcbSerialNumber, controller.signal);
      if (!deviceData || activePCBRef.current !== pcbSerialNumber) return;

      if (deviceData.latest_status_event_id != null) {
        lastStatusEventIdRef.current = deviceData.latest_status_event_id;
      }

      const isOnline = deviceData.is_online;
      setSensorData({
        outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
        humidity: isOnline ? deviceData.room_humidity?.value : null,
        roomTemp: isOnline ? deviceData.room_temperature?.value : null,
        fanSpeed: isOnline ? deviceData.fan_speed?.value ?? "0" : "0",
        temperature: isOnline ? deviceData.set_temperature?.value ?? 25 : 25,
        powerStatus: isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
        mode: deviceData.mode?.value || "3",
        errorFlag: isOnline ? deviceData.error_flag?.value || "0" : "0",
        hvacBusy: isOnline ? deviceData.hvac_busy?.value || "0" : "0",
        deviceId: pcbSerialNumber,
        alarmOccurred: deviceData.alarm_occurred?.value || "0",
        isOnline,
      });

      const alarmValue = deviceData.alarm_occurred?.value;
      setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
    } catch (error) {
      if (error.name !== "AbortError") console.error("Event refresh failed:", error);
    } finally {
      if (eventAbortRef.current === controller) eventAbortRef.current = null;
      isFetchingRef.current = false;
    }
  };
  useEffect(() => {
    if (!initialDataLoaded || !activePCBRef.current) return;

    initialAlarmTimerRef.current = setTimeout(() => {
      if (!processingRef.current && document.visibilityState === "visible") {
        fetchAllAlarms();
      }
    }, 500);

    if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current);
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);

    fetchIntervalRef.current = setInterval(() => {
      if (!processingRef.current && document.visibilityState === "visible") {
        fetchData();
      }
    }, 10000);

    alarmIntervalRef.current = setInterval(() => {
      if (!processingRef.current && document.visibilityState === "visible") {
        fetchAllAlarms();
      }
    }, 61000);

    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current);
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      if (initialAlarmTimerRef.current) clearTimeout(initialAlarmTimerRef.current);
      if (eventAbortRef.current) eventAbortRef.current.abort();
      fetchIntervalRef.current = null;
      alarmIntervalRef.current = null;
      initialAlarmTimerRef.current = null;
    };
  }, [initialDataLoaded, selectedService?.pcb_serial_number]);

const fetchAllAlarms = async () => {
  try {
    const devices = await fetchAllDevicesSegregatedData(serviceItems);
    setAllDevicesData(devices);
    setDropdownAlarmCount(
      devices.reduce((count, item) => count + Number(item.alarm_occurred?.value || 0), 0)
    );
  } catch (error) {
    console.error("Event alarm summary failed:", error);
  }
};
  // Send temperature command to device
  const sendTemperatureCommand = async (temperature) => {
    try {
      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
        MD: parseInt(displayData.mode) || 3,
        FS: parseInt(displayData.fanSpeed) || 0,
        SRT: parseInt(temperature) || 25,
        HVAC: displayData.powerStatus === "on" ? "1" : "0",
        Footer: "0xZX",
      };

      console.log("🌡️ Sending temperature command:", payload);

      beginPendingCommand(payload);

      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to send temperature command");
      }

      console.log("✅ Temperature command sent:", temperature);
    } catch (error) {
      console.error("Error sending temperature command:", error);
      stopProcessing();
    }
  };

  // Handle temperature change during drag
  const handleTempChange = (newTemp) => {
    setDisplayData((prev) => ({ ...prev, temperature: newTemp }));
    setIsDraggingTemp(true);
    
    if (displayData.powerStatus === "off") {
      console.log(`Temperature set to ${newTemp}°C (will apply when power turns on)`);
    }
  };

  const handleTempChangeEnd = useCallback((newTemp) => {
    setIsDraggingTemp(false);
    if (displayData.powerStatus === "on") {
      setPendingTemperature(newTemp);
      setShowTempConfirmDialog(true);
    }
  }, [displayData.powerStatus]);

  const confirmTempChange = async () => {
    if (pendingTemperature === null) return;
    const tempToSend = pendingTemperature;

    setShowTempConfirmDialog(false);
    setPendingTemperature(null);

    await sendTemperatureCommand(tempToSend);
  };

  const cancelTempChange = () => {
    setShowTempConfirmDialog(false);
    setPendingTemperature(null);
    setDisplayData((prev) => ({ ...prev, temperature: sensorData.temperature }));
  };

  // Handle mode change
  const handleModeChange = async (newMode) => {
    if (processing.status || !sensorData.isOnline) return;
    
    const newModeCode = MODE_CODE_MAP[newMode] || 1;
    setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
    if (displayData.powerStatus === "on") {
      await sendModeCommand(newModeCode.toString(), newMode);
    }
  };

  // Send mode command
  const sendModeCommand = async (modeCode, modeName) => {
    try {
      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
        MD: parseInt(modeCode) || 3,
        FS: parseInt(displayData.fanSpeed) || 0,
        SRT: parseInt(displayData.temperature) || 25,
        HVAC: displayData.powerStatus === "on" ? "1" : "0",
        Footer: "0xZX",
      };
      
      beginPendingCommand(payload);

      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        stopProcessing();
        throw new Error("Failed to send command");
      }
      
      console.log("✅ Mode command sent:", modeName);
    } catch (error) {
      console.error("Error sending mode command:", error);
      stopProcessing();
    }
  };

  // Handle fan speed change
  const handleFanSpeedChange = async (newPosition) => {
    if (processing.status || !sensorData.isOnline) return;
    
    const newSpeed = FAN_SPEEDS[newPosition];
    setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));
    
    if (displayData.powerStatus === "on") {
      await sendFanCommand(newSpeed);
    } else {
      console.log(`Fan speed set to ${newSpeed} (will apply when power turns on)`);
    }
  };

  // Send fan command
  const sendFanCommand = async (fanSpeed) => {
    try {
      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
        MD: parseInt(displayData.mode) || 3,
        FS: parseInt(fanSpeed) || 0,
        SRT: parseInt(displayData.temperature) || 25,
        HVAC: displayData.powerStatus === "on" ? "1" : "0",
        Footer: "0xZX",
      };
      
      beginPendingCommand(payload);

      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        stopProcessing();
        throw new Error("Failed to send command");
      }
      
      console.log("✅ Fan command sent:", fanSpeed);
    } catch (error) {
      console.error("Error sending fan command:", error);
      stopProcessing();
    }
  };


  const beginPendingCommand = (command, confirmationFields) => {
    commandBaselineEventIdRef.current = lastStatusEventIdRef.current;
    pendingCommandRef.current = { ...command, confirmationFields };
    startProcessingCycle();
  };

  const pollEventForCommandConfirmation = async () => {
    const pcbSerialNumber = activePCBRef.current;
    const pendingCommand = pendingCommandRef.current;
    if (!pcbSerialNumber || !pendingCommand) return;

    try {
      const events = await fetchStatusEventsForPCB(pcbSerialNumber);
      const baseline = Number(commandBaselineEventIdRef.current || 0);
      const match = events.find(
        (event) =>
          Number(event.id) > baseline &&
          eventMatchesCommand(event.parsed, pendingCommand)
      );

      if (!match) return;
      lastStatusEventIdRef.current = match.id;

      if (pendingCommand.confirmationFields?.includes("DS")) {
        const confirmedPowerStatus =
          Number(match.parsed.values.DS) === 0 ? "off" : "on";
        setSensorData((previous) => ({
          ...previous,
          powerStatus: confirmedPowerStatus,
        }));
        setDisplayData((previous) => ({
          ...previous,
          powerStatus: confirmedPowerStatus,
        }));
      }

      await fetchData();
      stopProcessing();
    } catch (error) {
      console.error("Command confirmation poll failed:", error);
    }
  };
  // Start progressive message cycle
const startProcessingCycle = () => {
  // Clear any stale timers from a previous cycle
  if (processingTimerRef.current) {
    clearInterval(processingTimerRef.current);
    processingTimerRef.current = null;
  }
  if (commandTimeoutRef.current) {
    clearTimeout(commandTimeoutRef.current);
    commandTimeoutRef.current = null;
  }
  if (cancelAvailabilityTimerRef.current) {
    clearTimeout(cancelAvailabilityTimerRef.current);
    cancelAvailabilityTimerRef.current = null;
  }
  if (processingPollRef.current) {
    clearInterval(processingPollRef.current);
    processingPollRef.current = null;
  }

  hasStoppedRef.current = false;
  setCanCancelProcessing(false);
  processingMsgIndexRef.current = 0;
  processingStartTimeRef.current = Date.now();
  setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

  // Message cycle (unchanged) - purely cosmetic progress text
  processingTimerRef.current = setInterval(() => {
    processingMsgIndexRef.current += 1;
    const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
    if (nextMsg) {
      setProcessing({ status: true, message: nextMsg });
    }
  }, 10000);

  // ✅ NEW: actively poll the device every few seconds while processing,
  // so we can exit as soon as hvac_busy flips back to "0"
  processingPollRef.current = setInterval(() => {
    pollEventForCommandConfirmation();
  }, COMMAND_CONFIRMATION_POLL_MS);
  cancelAvailabilityTimerRef.current = setTimeout(() => {
    setCanCancelProcessing(true);
  }, COMMAND_CANCEL_DELAY_MS);

  // Keep confirming from raw events for up to five minutes.
  commandTimeoutRef.current = setTimeout(() => {
    stopProcessing();
    fetchData();
    console.log("Command confirmation timed out after 300 seconds; refreshed event state.");
  }, COMMAND_CONFIRMATION_TIMEOUT_MS);
};

const stopProcessing = () => {
  if (hasStoppedRef.current) return;
  hasStoppedRef.current = true;

  if (processingTimerRef.current) {
    clearInterval(processingTimerRef.current);
    processingTimerRef.current = null;
  }
  if (commandTimeoutRef.current) {
    clearTimeout(commandTimeoutRef.current);
    commandTimeoutRef.current = null;
  }
  if (cancelAvailabilityTimerRef.current) {
    clearTimeout(cancelAvailabilityTimerRef.current);
    cancelAvailabilityTimerRef.current = null;
  }
  if (processingPollRef.current) {           // ✅ clear the fast poll too
    clearInterval(processingPollRef.current);
    processingPollRef.current = null;
  }

  setCanCancelProcessing(false);
  pendingCommandRef.current = null;
  commandBaselineEventIdRef.current = null;
  setProcessing({ status: false, message: "" });
  console.log("🔄 Processing stopped.");
};

const cancelCommandConfirmation = () => {
  stopProcessing();
  fetchData();
};


  useEffect(() => {
  return () => {
    if (processingTimerRef.current) clearInterval(processingTimerRef.current);
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    if (cancelAvailabilityTimerRef.current) clearTimeout(cancelAvailabilityTimerRef.current);
    if (processingPollRef.current) clearInterval(processingPollRef.current); // ✅
  };
}, []);

  useEffect(() => {
    if (selectedService?.pcb_serial_number) {
      console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
      activePCBRef.current = selectedService.pcb_serial_number;
    }
  }, [selectedService?.pcb_serial_number]);

  const sendRefreshToController = async () => {
    if (!selectedService?.pcb_serial_number) {
      setRefreshStatus({ sending: false, success: false, message: "No device selected" });
      return { success: false };
    }
    try {
      const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
      if (result.success) {
        setRefreshStatus({ sending: false, success: true, message: "Refresh sent successfully" });
        setTimeout(() => setRefreshStatus({ sending: false, success: false, message: "" }), 3000);
        return result;
      }
      const msg = result?.error || result?.message || "Failed to send refresh command";
      setRefreshStatus({ sending: false, success: false, message: msg });
      setTimeout(() => setRefreshStatus({ sending: false, success: false, message: "" }), 2000);
      return result;
    } catch (error) {
      setRefreshStatus({ sending: false, success: false, message: error.message || "Unexpected error" });
      return { success: false };
    }
  };

 

  const handleTouchStart = (e) => {
  if (e.target.closest && e.target.closest(".temp-container")) return;
  touchStartY.current = e.touches[0].clientY;
};

  const handleTouchMove = (e) => {
  if (e.target.closest && e.target.closest(".temp-container")) return;
  if (containerRef.current && containerRef.current.scrollTop > 0) return;
  const pullDistance = e.touches[0].clientY - touchStartY.current;
  if (pullDistance > 0) {
    e.preventDefault();
    setPullToRefresh({ isPulling: true, pullDistance: Math.min(pullDistance, MAX_PULL), isRefreshing: false });
  }
};

const handleTouchEnd = async () => {
  if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
    setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
    await sendRefreshToController();
    setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false }); // ⬅ reset after completion
    setManualRefresh(true);
  } else {
    setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
  }
};
 

  const handleMouseDown = (e) => {
  if (e.target.closest && e.target.closest(".temp-container")) return;
  touchStartY.current = e.clientY;
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};
  const handleMouseMove = (e) => {
    if (containerRef.current && containerRef.current.scrollTop > 0) return;
    const pullDistance = e.clientY - touchStartY.current;
    if (pullDistance > 0) {
      e.preventDefault();
      setPullToRefresh({ isPulling: true, pullDistance: Math.min(pullDistance, MAX_PULL), isRefreshing: false });
    }
  };


  const handleMouseUp = async () => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
  if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
    setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
    await sendRefreshToController();
    setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false }); // ⬅ reset after completion
    setManualRefresh(true);
  } else {
    setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
  }
};
  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handlePowerToggle = async () => {
    try {
      if (processing.status || sensorData.hvacBusy == "1") {
        const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
        setProcessing({ status: true, message: msg });
        return;
      }

      const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
      const isShutdown = displayData?.fanSpeed == 3 || displayData?.mode == 0;

      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
        MD: isShutdown ? "3" : displayData.mode,
        FS: isShutdown ? "0" : displayData.fanSpeed,
        SRT: displayData.temperature,
        HVAC: newHvacValue,
        Footer: "0xZX",
      };

      beginPendingCommand(payload, ["DS"]);

      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("❌ API error:", response.status);
        stopProcessing();
        throw new Error("Failed to send command");
      }

      const result = await response.text();
      console.log("✅ Command sent:", result);
    } catch (error) {
      console.error("🔥 Power toggle error:", error.message);
      stopProcessing();
    }
  };

  const handleNavigation = (path) => {
    if (!processing.status) navigate(path);
  };

  // Handle service selection with confirmation
  const handleServiceSelect = (item) => {
    if (selectedService?.service_item_id === item.service_item_id) {
      setShowServiceDropdown(false);
      return;
    }
    
    setPendingService(item);
    setShowConfirmDialog(true);
    setShowServiceDropdown(false);
  };

  // Confirm and execute service switch with data fetching
  const confirmServiceSwitch = async () => {
    if (!pendingService) return;
    
    setShowConfirmDialog(false);
    setSwitchingService(true);
    setSwitchingProgress(0);
    
    try {
      // Message 1: Connecting
      setLoadingMessage(SWITCHING_MESSAGES[0]);
      setSwitchingProgress(10);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 1: Update the active PCB
      activePCBRef.current = pendingService.pcb_serial_number;
      
      // Message 2: Fetching data
      setLoadingMessage(SWITCHING_MESSAGES[1]);
      setSwitchingProgress(30);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const deviceData = await fetchDataForPCB(pendingService.pcb_serial_number, pendingService.service_item_id);
      
      if (!deviceData) {
        setLoadingMessage("Connected but no data available");
        setSwitchingProgress(70);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setSelectedService(pendingService);
        setSwitchingProgress(100);
        setSwitchingService(false);
        setLoadingMessage("");
        
        setSwitchNotification({ 
          show: true, 
          message: `Connected to ${pendingService.service_item_name}` 
        });
        
        setTimeout(() => {
          setSwitchNotification({ show: false, message: "" });
        }, 3000);
        return;
      }
      
      // Message 3: Processing
      setLoadingMessage(SWITCHING_MESSAGES[2]);
      setSwitchingProgress(50);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update sensor data with new values
      const isOnline = deviceData.is_online;
      setSensorData({
        outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
        humidity: isOnline ? deviceData.room_humidity?.value : null,
        roomTemp: isOnline ? deviceData.room_temperature?.value : null,
        fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
        temperature: isOnline ? deviceData.set_temperature?.value : 25,
        powerStatus: isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
        mode: deviceData.mode?.value || "3",
        errorFlag: isOnline ? deviceData.error_flag?.value : "0",
        hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
        deviceId: pendingService.pcb_serial_number,
        alarmOccurred: deviceData.alarm_occurred?.value || "0",
        isOnline: isOnline,
      });
      
      // Update display data
      setDisplayData({
        fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
        temperature: isOnline ? deviceData.set_temperature?.value : 25,
        mode: deviceData.mode?.value || "3",
        powerStatus: isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
      });
      
      // Message 4: Updating
      setLoadingMessage(SWITCHING_MESSAGES[3]);
      setSwitchingProgress(70);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update error count
      const alarmValue = deviceData.alarm_occurred?.value;
      setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
      
      // Message 5: Finalizing
      setLoadingMessage(SWITCHING_MESSAGES[4]);
      setSwitchingProgress(85);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Finally update the selected service
      setSelectedService(pendingService);
      
      // Message 6: Complete
      setLoadingMessage(SWITCHING_MESSAGES[5]);
      setSwitchingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setSwitchingService(false);
      setLoadingMessage("");
      
      // Show success notification
      setSwitchNotification({ 
        show: true, 
        message: `Successfully switched to ${pendingService.service_item_name}` 
      });
      
      setTimeout(() => {
        setSwitchNotification({ show: false, message: "" });
      }, 3000);
      
    } catch (error) {
      console.error("❌ Error switching service:", error);
      setSwitchingService(false);
      setLoadingMessage("");
      
      setSelectedService(pendingService);
      setSwitchNotification({ 
        show: true, 
        message: `Switched to ${pendingService.service_item_name}` 
      });
      
      setTimeout(() => {
        setSwitchNotification({ show: false, message: "" });
      }, 3000);
    }
  };

  const cancelServiceSwitch = () => {
    setShowConfirmDialog(false);
    setPendingService(null);
  };

  const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;

  const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
  const indicatorRotation = pullProgress * 360;
  const indicatorOpacity = pullProgress;

  // ✅ MODIFIED: Loading state checks
  // Show loading if initial data is not loaded yet OR loading is true
  if (loading || !initialDataLoaded) {
    return (
      <Loading
        onLogout={handleLogout}
        title={connectionStatus.title}
        message={connectionStatus.message}
        onRetry={
          connectionStatus.phase === "connecting"
            ? undefined
            : () => setInitializationRun((run) => run + 1)
        }
      />
    );
  }

  if (!loading && serviceItems.length === 0 && !manualRefresh) {
    return <NoServiceItems onLogout={handleLogout} onNavigateHome={() => navigate("/home")} />;
  }

  return (
    <div
      className="mainmain-container"
      style={{ backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)", touchAction: "pan-y" }}
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      <PullToRefreshStatus
        pullToRefresh={pullToRefresh}
        threshold={PULL_THRESHOLD}
        rotation={indicatorRotation}
        opacity={indicatorOpacity}
      />


      <div className="main-container">
        {/* Refresh status toast */}
        {/* {refreshStatus.message && (
          <div className={`screen1-refresh-status ${refreshStatus.success ? "success" : "error"}`}>
            {refreshStatus.message}
          </div>
        )} */}
        {/* Refresh status toast (popup, floating) */}
        {refreshStatus.message && (
          <div className={`refresh-status-toast ${refreshStatus.success ? "success" : "error"}`}>
            {refreshStatus.message}
          </div>
        )}

        {/* Success Notification Toast */}
        {switchNotification.show && (
          <div className="switch-notification">
            <span>✅</span>
            <span>{switchNotification.message}</span>
          </div>
        )}

        {showConfirmDialog && (
          <ConfirmationDialog
            title="Switch Service?"
            confirmLabel="Yes, Switch"
            onConfirm={confirmServiceSwitch}
            onCancel={cancelServiceSwitch}
          >
            <p>
              Are you sure you want to switch to{" "}
              <strong>{pendingService?.service_item_name}</strong>?
            </p>
          </ConfirmationDialog>
        )}

        {showTempConfirmDialog && (
          <ConfirmationDialog
            title="Change Temperature?"
            confirmLabel="Yes, Set"
            onConfirm={confirmTempChange}
            onCancel={cancelTempChange}
          >
            <p>
              Set temperature to <strong>{pendingTemperature}�C</strong>?
            </p>
          </ConfirmationDialog>
        )}

        {switchingService && (
          <ServiceSwitchOverlay
            message={loadingMessage}
            progress={switchingProgress}
          />
        )}

        <MachineHeader
          dropdownProps={{
            isOpen: showServiceDropdown,
            onToggle: () => setShowServiceDropdown(!showServiceDropdown),
            services: serviceItems,
            selectedService,
            allDevicesData,
            totalAlarmCount: dropdownAlarmCount,
            onSelect: handleServiceSelect,
          }}
          processing={processing}
          sensorData={sensorData}
          controlsDisabled={isControlDisabled()}
          onPowerToggle={handlePowerToggle}
        />

        {/* Logo below the row */}
        <div className="logo-container">
          <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
        </div>

<div style={{ 
  pointerEvents: isControlDisabled() ? "none" : "auto", 
  opacity: isControlDisabled() ? 0.35 : 1 
}}>
  <TemperatureDial
    onTempChange={handleTempChange}
    onTempChangeEnd={handleTempChangeEnd}
    fanSpeed={fanPosition}
    initialTemperature={displayData.temperature ?? 25}
    disabled={isControlDisabled()}
  />
</div>

        {/* Offline banner */}
        {!sensorData.isOnline && (
          <div
            style={{
              color: "rgba(0,0,0,0.55)",
              backgroundColor: "#fff",
              textAlign: "center",
              padding: "10px 20px",
              borderRadius: "10px",
              margin: "12px 20px 4px 20px",
              fontSize: "14px",
              fontWeight: "bold",
              letterSpacing: "0.5px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>📴</span>
            <span>System is Offline</span>
          </div>
        )}

        {/* Status messages */}
        {processing.status && (
          <div className="screen1-processing-message">
            <span>{processing.message}</span>
            {canCancelProcessing && (
              <button
                type="button"
                className="screen1-cancel-processing"
                onClick={cancelCommandConfirmation}
              >
                Stop waiting
              </button>
            )}
          </div>
        )}

        {sensorData.errorFlag == "1" && (
          <div className="screen1-error-message">⚠️ System Error Detected - Control Disabled</div>
        )}

        {sensorData.hvacBusy == "1" && !processing.status && (
          <div className="screen1-busy-message">⏳ System is currently busy - Control Disabled</div>
        )}

        <EnvironmentReadings sensorData={sensorData} />
      </div>

      {/* Footer */}
      <div className="footer-container">
        <MachineControls
          currentMode={currentModeDescription}
          fanPosition={fanPosition}
          controlsDisabled={isControlDisabled()}
          onModeChange={handleModeChange}
          onFanSpeedChange={handleFanSpeedChange}
        />

        <ActionMenu
          hasValidPCBSerial={hasValidPCBSerial}
          errorCount={errorCount}
          onAlarms={() =>
            navigate("/alarms", {
              state: {
                alarmData: {
                  alarmOccurred: sensorData.alarmOccurred,
                  errorCount,
                  deviceId: sensorData.deviceId,
                },
                userId,
                company_id,
              },
            })
          }
          onNavigate={handleNavigation}
          onLogout={handleLogout}
        />

        <div className="footer-logo">
          <img src={greenAire} alt="GreenAire Logo" className="logo-image" style={{ marginTop: "-12px" }} />
        </div>
      </div>
    </div>
  );
};

export default Screen1FromEvents;

