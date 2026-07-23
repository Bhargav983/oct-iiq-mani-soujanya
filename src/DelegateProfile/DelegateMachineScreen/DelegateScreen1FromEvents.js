import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from "react";
import "../../Components/Screens/MachineScreensNew/Screen1.css";
import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
import { useNavigate } from "react-router-dom";
import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
import { AuthContext } from "../../Components/AuthContext/AuthContext";
import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";

import NoServiceItems from "../../Components/Screens/MachineScreensNew/NoServiceItems";
import Loading from "../../Components/Screens/MachineScreensNew/Loading";
import ActionMenu from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/ActionMenu";
import ConfirmationDialog from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/ConfirmationDialog";
import EnvironmentReadings from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/EnvironmentReadings";
import MachineControls from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/MachineControls";
import MachineHeader from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/MachineHeader";
import PullToRefreshStatus from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/PullToRefreshStatus";
import ServiceSwitchOverlay from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/components/ServiceSwitchOverlay";
import {
  FAN_SPEEDS,
  MAX_PULL,
  MODE_CODE_MAP,
  MODE_MAP,
  PROCESSING_MESSAGES,
  PULL_THRESHOLD,
} from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/constants";
import { sendRefreshCommand } from "../../Components/Screens/MachineScreensNew/Screen1FromSensorReadings/controllerApi";


import { normalizeDelegateAssignments } from "./delegateAssignments";
import {
  eventMatchesCommand,
  fetchAllDevicesSegregatedData,
  fetchSegregatedDeviceData,
  fetchStatusEventsForPCB,
} from "../../Components/Screens/MachineScreensNew/deviceEventsService";


const COMMAND_CONFIRMATION_TIMEOUT_MS = 300000;
const COMMAND_CONFIRMATION_POLL_MS = 2000;
const COMMAND_CANCEL_DELAY_MS = 60000;

const DelegateScreen1FromEvents = () => {
  const { user, logout } = useContext(AuthContext);
  const {
    serviceItems: delegateAssignments,
    selectedServiceItem,
    serviceItemDetails,
    updateSelectedServiceItem,
    loading: assignmentsLoading,
    error: assignmentError,
    retry: retryAssignments,
  } = useDelegateServiceItems();
  const userId = user?.delegate_id;
  const company_id = user?.company_id;
  const navigate = useNavigate();
  const normalizedServiceItems = useMemo(
    () =>
      normalizeDelegateAssignments(
        delegateAssignments,
        serviceItemDetails,
        userId
      ),
    [delegateAssignments, serviceItemDetails, userId]
  );

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
  const processingCycleRef = useRef(0);
  const pendingCommandsByPCBRef = useRef(new Map());
  const eventAbortRef = useRef(null);
  const fetchIntervalRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const initialAlarmTimerRef = useRef(null);

  const processingTimerRef = useRef(null);
  const processingMsgIndexRef = useRef(0);
  const commandTimeoutRef = useRef(null);
  const cancelAvailabilityTimerRef = useRef(null);

  const [serviceItems, setServiceItems] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const serviceItemPermissions = selectedService?.permissions || {};
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
  // Delegate controls require explicit permission for the selected assignment.
  if (!serviceItemPermissions.can_control_equipment) return true;

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
    const activePending = pendingCommandsByPCBRef.current.get(
      selectedService?.pcb_serial_number
    );
    setDisplayData(
      activePending?.optimisticDisplay || {
        fanSpeed: sensorData.fanSpeed,
        temperature: sensorData.temperature,
        mode: sensorData.mode,
        powerStatus: sensorData.powerStatus,
      }
    );
  }, [sensorData, processing.status, selectedService?.pcb_serial_number]);

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
  // Initialize from the delegate assignment context, then load raw Events for its PCB.
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      if (assignmentsLoading) return;
      if (assignmentError) {
        setConnectionStatus({
          phase: "unavailable",
          title: "Unable to load assigned machines",
          message: "Delegate services are temporarily unavailable. Please retry.",
        });
        setInitialDataLoaded(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setInitialDataLoaded(false);
      setConnectionStatus({
        phase: "connecting",
        title: "Loading assigned machines",
        message: "Please wait while we load your delegate access.",
      });
      setServiceItems(normalizedServiceItems);

      if (normalizedServiceItems.length === 0) {
        setInitialDataLoaded(true);
        setLoading(false);
        return;
      }

      const selected =
        normalizedServiceItems.find(
          (item) => item.service_item_id === selectedServiceItem
        ) || normalizedServiceItems[0];

      setSelectedService(selected);
      updateSelectedServiceItem(selected.service_item_id);
      activePCBRef.current = selected.pcb_serial_number;
      setLoading(false);
      setLoadingMessage("Loading device Events...");

      const deviceData = selected.pcb_serial_number
        ? await fetchDataForPCB(selected.pcb_serial_number)
        : null;
      if (cancelled) return;

      if (deviceData) {
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
          deviceId: selected.pcb_serial_number,
          alarmOccurred: deviceData.alarm_occurred?.value || "0",
          isOnline,
        });
        const alarmValue = deviceData.alarm_occurred?.value;
        setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
      }

      setInitialDataLoaded(true);
      setLoadingMessage("");
      setPullToRefresh((previous) => ({ ...previous, isRefreshing: false }));
      setManualRefresh(false);
    };

    initialize().catch((error) => {
      if (cancelled) return;
      console.error("Delegate Events initialization failed:", error);
      setConnectionStatus({
        phase: "unavailable",
        title: "Unable to load assigned machines",
        message: "Delegate services are temporarily unavailable. Please retry.",
      });
      setLoading(false);
      setInitialDataLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [assignmentsLoading, assignmentError, normalizedServiceItems, selectedServiceItem, initializationRun, updateSelectedServiceItem]);
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
    if (!serviceItemPermissions.can_control_equipment) return;
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
    if (!serviceItemPermissions.can_control_equipment || processing.status || !sensorData.isOnline) return;
    
    const newModeCode = MODE_CODE_MAP[newMode] || 1;
    setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
    if (displayData.powerStatus === "on") {
      await sendModeCommand(newModeCode.toString(), newMode);
    }
  };

  // Send mode command
  const sendModeCommand = async (modeCode, modeName) => {
    if (!serviceItemPermissions.can_control_equipment) return;
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
    if (!serviceItemPermissions.can_control_equipment || processing.status || !sensorData.isOnline) return;
    
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
    if (!serviceItemPermissions.can_control_equipment) return;
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
    const baselineEventId = lastStatusEventIdRef.current;
    commandBaselineEventIdRef.current = baselineEventId;
    const cycleId = startProcessingCycle();
    const pendingCommand = {
      ...command,
      confirmationFields,
      deviceId: command.DI,
      cycleId,
    };
    pendingCommandRef.current = pendingCommand;
    pendingCommandsByPCBRef.current.set(command.DI, {
      command: { ...command, confirmationFields },
      baselineEventId,
      startedAt: Date.now(),
      optimisticDisplay: {
        fanSpeed: String(command.FS),
        temperature: Number(command.SRT),
        mode: String(command.MD),
        powerStatus: Number(command.HVAC) === 0 ? "off" : "on",
      },
    });
  };

  const resumePendingCommandForPCB = (pcbSerialNumber) => {
    const stored = pendingCommandsByPCBRef.current.get(pcbSerialNumber);
    if (!stored) return null;

    if (Date.now() - stored.startedAt >= COMMAND_CONFIRMATION_TIMEOUT_MS) {
      pendingCommandsByPCBRef.current.delete(pcbSerialNumber);
      return null;
    }

    commandBaselineEventIdRef.current = stored.baselineEventId;
    const remainingTimeout = Math.max(
      1,
      COMMAND_CONFIRMATION_TIMEOUT_MS - (Date.now() - stored.startedAt)
    );
    const cycleId = startProcessingCycle(remainingTimeout);
    pendingCommandRef.current = {
      ...stored.command,
      deviceId: pcbSerialNumber,
      cycleId,
    };
    setDisplayData(stored.optimisticDisplay);
    return stored;
  };

  const pollEventForCommandConfirmation = async () => {
    const pendingCommand = pendingCommandRef.current;
    const pcbSerialNumber = pendingCommand?.deviceId;
    const cycleId = pendingCommand?.cycleId;
    if (!pcbSerialNumber || !pendingCommand) return;

    try {
      const events = await fetchStatusEventsForPCB(pcbSerialNumber);
      if (
        processingCycleRef.current !== cycleId ||
        pendingCommandRef.current !== pendingCommand
      ) return;

      const baseline = Number(commandBaselineEventIdRef.current || 0);
      const match = events.find(
        (event) =>
          Number(event.id) > baseline &&
          eventMatchesCommand(event.parsed, pendingCommand)
      );

      if (!match) return;
      lastStatusEventIdRef.current = match.id;

      if (
        activePCBRef.current === pcbSerialNumber &&
        pendingCommand.confirmationFields?.includes("DS")
      ) {
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

      if (activePCBRef.current === pcbSerialNumber) await fetchData();
      stopProcessing(cycleId);
    } catch (error) {
      console.error("Command confirmation poll failed:", error);
    }
  };
  // Start progressive message cycle
const startProcessingCycle = (timeoutMs = COMMAND_CONFIRMATION_TIMEOUT_MS) => {
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

  const cycleId = processingCycleRef.current + 1;
  processingCycleRef.current = cycleId;
  hasStoppedRef.current = false;
  setCanCancelProcessing(false);
  processingMsgIndexRef.current = 0;
  processingStartTimeRef.current = Date.now();
  setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

  // Message cycle (unchanged) - purely cosmetic progress text
  processingTimerRef.current = setInterval(() => {
    processingMsgIndexRef.current += 1;
    const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
    if (processingCycleRef.current === cycleId && nextMsg) {
      setProcessing({ status: true, message: nextMsg });
    }
  }, 10000);

  // ✅ NEW: actively poll the device every few seconds while processing,
  // so we can exit as soon as hvac_busy flips back to "0"
  processingPollRef.current = setInterval(() => {
    pollEventForCommandConfirmation();
  }, COMMAND_CONFIRMATION_POLL_MS);
  cancelAvailabilityTimerRef.current = setTimeout(() => {
    if (processingCycleRef.current === cycleId) setCanCancelProcessing(true);
  }, COMMAND_CANCEL_DELAY_MS);

  // Keep confirming from raw events for up to five minutes.
  commandTimeoutRef.current = setTimeout(() => {
    const commandDeviceId = pendingCommandRef.current?.deviceId;
    stopProcessing(cycleId);
    if (activePCBRef.current === commandDeviceId) fetchData();
    console.log("Command confirmation timed out after 300 seconds; refreshed event state.");
  }, timeoutMs);

  return cycleId;
};

const stopProcessing = (expectedCycleId, { preservePending = false } = {}) => {
  if (expectedCycleId != null && processingCycleRef.current !== expectedCycleId) return;
  if (hasStoppedRef.current) return;
  hasStoppedRef.current = true;
  processingCycleRef.current += 1;
  const processingDeviceId = pendingCommandRef.current?.deviceId;
  if (!preservePending && processingDeviceId) {
    pendingCommandsByPCBRef.current.delete(processingDeviceId);
  }

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
    if (!serviceItemPermissions.can_control_equipment) {
      setRefreshStatus({ sending: false, success: false, message: "View-only access" });
      return { success: false };
    }
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
    if (!serviceItemPermissions.can_control_equipment) return;
    try {
      if (processing.status || sensorData.hvacBusy === "1") {
        const msg = sensorData.hvacBusy === "1" ? "System is busy, please wait..." : "Please wait...";
        setProcessing({ status: true, message: msg });
        return;
      }

      const newHvacValue = sensorData.powerStatus === "on" ? "0" : "1";
      const isShutdown = displayData?.fanSpeed === "3" || displayData?.mode === "0";

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

  // Switch UI context immediately, then hydrate it only with the selected PCB's Events snapshot.
  const confirmServiceSwitch = async () => {
    if (!pendingService) return;

    const nextService = pendingService;
    const nextPCB = nextService.pcb_serial_number;

    setShowConfirmDialog(false);
    setPendingService(null);
    stopProcessing(undefined, { preservePending: true });
    if (eventAbortRef.current) eventAbortRef.current.abort();

    activePCBRef.current = nextPCB;
    lastStatusEventIdRef.current = null;
    setSelectedService(nextService);
    updateSelectedServiceItem(nextService.service_item_id);
    setErrorCount(0);
    setSensorData({
      outsideTemp: null,
      humidity: null,
      roomTemp: null,
      fanSpeed: "0",
      temperature: 25,
      powerStatus: "off",
      mode: "3",
      errorFlag: "0",
      hvacBusy: "0",
      deviceId: nextPCB,
      alarmOccurred: "0",
      isOnline: false,
    });
    setDisplayData({
      fanSpeed: "0",
      temperature: 25,
      mode: "3",
      powerStatus: "off",
    });
    const resumedPending = resumePendingCommandForPCB(nextPCB);
    setSwitchingService(true);
    setLoadingMessage(`Loading ${nextService.service_item_name}...`);
    setSwitchingProgress(35);

    try {
      const deviceData = await fetchDataForPCB(nextPCB);
      if (activePCBRef.current !== nextPCB) return;

      if (deviceData) {
        const isOnline = deviceData.is_online;
        const nextSensorData = {
          outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
          humidity: isOnline ? deviceData.room_humidity?.value : null,
          roomTemp: isOnline ? deviceData.room_temperature?.value : null,
          fanSpeed: isOnline ? deviceData.fan_speed?.value ?? "0" : "0",
          temperature: isOnline ? deviceData.set_temperature?.value ?? 25 : 25,
          powerStatus: isOnline && deviceData.hvac_on?.value === "1" ? "on" : "off",
          mode: deviceData.mode?.value || "3",
          errorFlag: isOnline ? deviceData.error_flag?.value || "0" : "0",
          hvacBusy: isOnline ? deviceData.hvac_busy?.value || "0" : "0",
          deviceId: nextPCB,
          alarmOccurred: deviceData.alarm_occurred?.value || "0",
          isOnline,
        };

        setSensorData(nextSensorData);
        setDisplayData(
          resumedPending?.optimisticDisplay || {
            fanSpeed: nextSensorData.fanSpeed,
            temperature: nextSensorData.temperature,
            mode: nextSensorData.mode,
            powerStatus: nextSensorData.powerStatus,
          }
        );
        setErrorCount(
          nextSensorData.alarmOccurred !== "0"
            ? Number(nextSensorData.alarmOccurred)
            : 0
        );
      }

      setSwitchNotification({
        show: true,
        message: `Switched to ${nextService.service_item_name}`,
      });
      setTimeout(() => {
        setSwitchNotification({ show: false, message: "" });
      }, 3000);
    } catch (error) {
      if (activePCBRef.current === nextPCB) {
        console.error("Error switching service:", error);
        setSwitchNotification({
          show: true,
          message: `${nextService.service_item_name} selected; live data is temporarily unavailable.`,
        });
      }
    } finally {
      if (activePCBRef.current === nextPCB) {
        setSwitchingProgress(100);
        setSwitchingService(false);
        setLoadingMessage("");
      }
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

  if (assignmentError) {
    return (
      <Loading
        onLogout={handleLogout}
        title="Unable to load assigned machines"
        message="Delegate services are temporarily unavailable. Please retry."
        onRetry={retryAssignments}
      />
    );
  }
  if (!loading && serviceItems.length === 0 && !manualRefresh) {
    return <NoServiceItems onLogout={handleLogout} onNavigateHome={() => navigate("/delegate-home")} />;
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

        {sensorData.errorFlag === "1" && (
          <div className="screen1-error-message">⚠️ System Error Detected - Control Disabled</div>
        )}

        {sensorData.hvacBusy === "1" && !processing.status && (
          <div className="screen1-busy-message">⏳ System is currently busy - Control Disabled</div>
        )}

        {!serviceItemPermissions.can_control_equipment && (
          <div className="screen1-busy-message">
            View only - control permission was not granted for this machine.
          </div>
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
            navigate("/Delegate-alarms", {
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
          servicePath={"/delegate-home"}
          timersDisabled={!serviceItemPermissions.can_control_equipment}
        />

        <div className="footer-logo">
          <img src={greenAire} alt="GreenAire Logo" className="logo-image" style={{ marginTop: "-12px" }} />
        </div>
      </div>
    </div>
  );
};

export default DelegateScreen1FromEvents;

