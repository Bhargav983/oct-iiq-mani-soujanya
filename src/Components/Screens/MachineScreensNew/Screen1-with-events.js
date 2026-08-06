// import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
// import {
//   FiPower,
//   FiWind,
//   FiClock,
//   FiWatch,
//   FiSettings,
//   FiZap,
//   FiLogOut,
//   FiSun,
//   FiDroplet,
//   FiThermometer,
//   FiRefreshCw,
//   FiChevronDown,
// } from "react-icons/fi";
// import { FaFan } from "react-icons/fa";
// import "./Screen1.css";
// import AIROlogo from "./Images/AIRO.png";
// import greenAire from "./Images/greenAire.png";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../../AuthContext/AuthContext";
// import TemperatureDial from "./TemperatureDial";
// import baseURL from "../../ApiUrl/Apiurl";
// import NoServiceItems from "./NoServiceItems";
// import Loading from "./Loading";


// // Constants
// const MODE_MAP = {
//   1: "IDEC",
//   2: "Auto",
//   3: "Fan",
//   4: "Indirect",
//   5: "Direct",
// };

// const MODE_CODE_MAP = {
//   IDEC: 1,
//   Auto: 2,
//   Fan: 3,
//   Indirect: 4,
//   Direct: 5,
// };

// const FAN_SPEEDS = ["0", "1", "2"];
// const FAN_LABELS = ["High", "Medium", "Low"];

// const PULL_THRESHOLD = 80;
// const MAX_PULL = 120;

// const PROCESSING_MESSAGES = [
//   "1/6 Sending request...",
//   "2/6 Connecting to device...",
//   "3/6 Applying changes...",
//   "4/6 Syncing settings...",
//   "5/6 Confirming status...",
//   "6/6 Finalizing...",
// ];

// const SWITCHING_MESSAGES = [
//   "Connecting to device...",
//   "Fetching data from Machine...",
//   "Processing device information...",
//   "Updating system status...",
//   "Finalizing connection...",
//   "Connected successfully!",
// ];

// // ✅ how often we poll the events endpoint while a command is "in flight"
// const EVENTS_POLL_INTERVAL = 5000; // 5s
// // ✅ per-device events endpoint — returns the latest 10 events for a given device_id
// const EVENTS_FILTER_API_URL = "https://mdata.air2o.net/events/filter/";
// // ✅ get-latest-data lags behind the events feed by ~15-25s. After we apply a
// // confirmed value from an event, we protect fanSpeed/mode/temperature/powerStatus
// // from being overwritten by a stale get-latest-data response for this long.
// const CONTROL_VALUE_GRACE_MS = 30000; // 30s

// const getStoredService = () => {
//   try {
//     const stored = localStorage.getItem("selectedService");
//     return stored ? JSON.parse(stored) : null;
//   } catch (e) {
//     return null;
//   }
// };

// const formatTemp = (temp) => {
//   if (temp == null) return "0.0";
//   const num = parseFloat(temp);
//   return isNaN(num) ? "0.0" : num.toFixed(1);
// };

// const sendRefreshCommand = async (pcbSerialNumber, sensorData) => {
//   const payload = {
//     Header: "0xAA",
//     DI: pcbSerialNumber || "2411GM-0102",
//     MD: sensorData.mode || "3",
//     FS: sensorData.fanSpeed || "0",
//     SRT: sensorData.temperature || 25,
//     HVAC: "3",
//     Footer: "0xZX",
//   };
//   console.group("🔁 REFRESH COMMAND");
//   console.log("📦 Payload:", payload);
//   console.groupEnd();
//   try {
//     const response = await fetch("https://mdata.air2o.net/controllers/", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload),
//     });
//     let responseBody;
//     try {
//       responseBody = await response.json();
//     } catch {
//       responseBody = await response.text();
//     }
//     if (!response.ok) {
//       return {
//         success: false,
//         error: responseBody?.error || responseBody?.message || "Command rejected by server",
//         status: response.status,
//       };
//     }
//     return { success: true, data: responseBody };
//   } catch (error) {
//     return { success: false, error: "Network error or server unreachable" };
//   }
// };

// const getAlarmCountForItem = (item, allDevicesData) => {
//   if (!allDevicesData || !item) return 0;
//   const deviceData = allDevicesData.find(d => d.service_item_id === item.service_item_id);
//   if (!deviceData) return 0;
//   const alarmValue = deviceData.alarm_occurred?.value;
//   return alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0;
// };

// // ✅ NEW: parses a payload string like
// // "0xA3,DI:2507GM0294,FS:2,MD:4,AMD:0,TAS:98,DS:32,LEU:0,SRT:39,EC:0,0xZA"
// // into a plain key/value object: { DI: "2507GM0294", FS: "2", MD: "4", ... }
// const parseEventPayload = (payloadStr) => {
//   if (!payloadStr || typeof payloadStr !== "string") return null;
//   try {
//     const result = {};
//     payloadStr.split(",").forEach((part) => {
//       const trimmed = part.trim();
//       const sepIndex = trimmed.indexOf(":");
//       if (sepIndex === -1) return; // skip header/footer tokens like "0xA3" / "0xZA"
//       const key = trimmed.slice(0, sepIndex).trim();
//       const value = trimmed.slice(sepIndex + 1).trim();
//       if (key) result[key] = value;
//     });
//     return result;
//   } catch (e) {
//     console.error("❌ Failed to parse event payload:", e);
//     return null;
//   }
// };

// // ✅ fetches the latest events for a specific device from the filter endpoint
// // (https://mdata.air2o.net/events/filter/?device_id=<pcbSerialNumber>), keeps
// // ONLY the "0xA3,..." status records (per requirement), parses each payload,
// // and returns them sorted newest-first (highest id first).
// const fetchEventsForPCB = async (pcbSerialNumber) => {
//   if (!pcbSerialNumber) return [];
//   try {
//     const url = `${EVENTS_FILTER_API_URL}?device_id=${encodeURIComponent(pcbSerialNumber)}`;
//     const response = await fetch(url);
//     if (!response.ok) throw new Error("Failed to fetch events for device");
//     const data = await response.json();

//     // Handle both plain array responses and DRF-paginated { results: [...] } responses
//     const rawEvents = Array.isArray(data) ? data : data.results || data.data || [];
//     if (!rawEvents.length) return [];

//     // Only 0xA3 status records — ignore any other event/frame types
//     const statusEvents = rawEvents.filter(
//       (ev) => typeof ev.payload === "string" && ev.payload.trim().startsWith("0xA3")
//     );

//     // Belt-and-braces: confirm the payload actually carries this device's DI
//     const needle = `DI:${pcbSerialNumber}`;
//     const deviceEvents = statusEvents.filter((ev) => ev.payload.includes(needle));
//     const candidates = deviceEvents.length ? deviceEvents : statusEvents;

//     return candidates
//       .map((ev) => ({ id: ev.id, created_at: ev.created_at, parsed: parseEventPayload(ev.payload) }))
//       .filter((ev) => ev.parsed !== null)
//       .sort((a, b) => Number(b.id) - Number(a.id)); // newest (highest id) first
//   } catch (err) {
//     console.error("❌ Event fetch error:", err);
//     return [];
//   }
// };

// // ✅ checks whether a parsed event's FS / MD / SRT / (derived on-off from DS)
// // match the exact command we just sent — so a stale/intermediate event
// // (e.g. one that arrived from a previous or in-flight command) isn't
// // mistaken for confirmation of THIS command.
// const eventMatchesPendingCommand = (parsed, pendingCmd) => {
//   if (!parsed) return false;
//   if (!pendingCmd) return true; // no specific target set — accept the newest event as-is

//   const { MD, FS, SRT, HVAC } = pendingCmd;

//   if (MD !== undefined && parsed.MD !== undefined && parseInt(parsed.MD) !== parseInt(MD)) {
//     return false;
//   }
//   if (FS !== undefined && parsed.FS !== undefined && parseInt(parsed.FS) !== parseInt(FS)) {
//     return false;
//   }
//   if (SRT !== undefined && parsed.SRT !== undefined && parseInt(parsed.SRT) !== parseInt(SRT)) {
//     return false;
//   }
//   if (HVAC !== undefined && parsed.DS !== undefined) {
//     const expectedOn = String(HVAC) === "1";
//     const actualOn = parsed.DS !== "0";
//     if (actualOn !== expectedOn) return false;
//   }

//   return true;
// };

// const Screen1 = () => {
//   const { user, logout } = useContext(AuthContext);
//   const userId = user?.customer_id;
//   const company_id = user?.company_id;
//   const navigate = useNavigate();

//   const [showTempConfirmDialog, setShowTempConfirmDialog] = useState(false);
//   const [pendingTemperature, setPendingTemperature] = useState(null);

//   const [pullToRefresh, setPullToRefresh] = useState({
//     isPulling: false,
//     pullDistance: 0,
//     isRefreshing: false,
//   });

//   const touchStartY = useRef(0);
//   const isFetchingRef = useRef(false);
//   const hasStoppedRef = useRef(false); // prevents clearProcessingIfDone from firing stopProcessing more than once per cycle
//   const containerRef = useRef(null);
//   const processingPollRef = useRef(null);
//   const processingRef = useRef(false);

//   const activePCBRef = useRef(null);
//   const fetchIntervalRef = useRef(null);

//   const processingTimerRef = useRef(null);
//   const processingMsgIndexRef = useRef(0);
//   const hardStopTimerRef = useRef(null);

//   // ✅ refs for the fast events-based poll
//   const eventsPollRef = useRef(null);
//   const lastEventIdRef = useRef(null);
//   const pendingCommandRef = useRef(null); // { MD, FS, SRT, HVAC } we're waiting to see confirmed
//   const lastEventConfirmedAtRef = useRef(0); // timestamp of last event-confirmed control value

//   const [serviceItems, setServiceItems] = useState([]);
//   const [selectedService, setSelectedService] = useState(getStoredService());
//   const [showServiceDropdown, setShowServiceDropdown] = useState(false);
//   const [processing, setProcessing] = useState({ status: false, message: "" });
//   const [errorCount, setErrorCount] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [manualRefresh, setManualRefresh] = useState(false);
//   const [refreshStatus, setRefreshStatus] = useState({
//     sending: false,
//     success: false,
//     message: "",
//   });
//   const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
//   const [initialDataLoaded, setInitialDataLoaded] = useState(false); // ✅ Track initial data loads

//   const processingStartTimeRef = useRef(null);
//   const MIN_PROCESSING_TIME = 5000;
//   const [allDevicesData, setAllDevicesData] = useState([]);
//   const [sensorData, setSensorData] = useState({
//     outsideTemp: 0,
//     humidity: 0,
//     roomTemp: 0,
//     fanSpeed: "0",
//     temperature: 25,
//     powerStatus: "off",
//     mode: "3",
//     errorFlag: "0",
//     hvacBusy: "0",
//     deviceId: "",
//     alarmOccurred: "0",
//     isOnline: true,
//   });

//   // keep it in sync with state
//   useEffect(() => {
//     processingRef.current = processing.status;
//   }, [processing.status]);

//   const isControlDisabled = () => {
//     if (processing.status) return true;
//     if (!sensorData.isOnline) return true;
//     if (sensorData.errorFlag === "1") return true;
//     if (sensorData.hvacBusy === "1") return true;
//     return false;
//   };

//   const [displayData, setDisplayData] = useState({
//     fanSpeed: "0",
//     temperature: 25,
//     mode: "3",
//     powerStatus: "off",
//   });

//   const [isDraggingTemp, setIsDraggingTemp] = useState(false);

//   const [showConfirmDialog, setShowConfirmDialog] = useState(false);
//   const [pendingService, setPendingService] = useState(null);
//   const [switchingService, setSwitchingService] = useState(false);
//   const [loadingMessage, setLoadingMessage] = useState("");
//   const [switchNotification, setSwitchNotification] = useState({ show: false, message: "" });
//   const [switchingProgress, setSwitchingProgress] = useState(0);

//   useEffect(() => {
//     setDisplayData({
//       fanSpeed: sensorData.fanSpeed,
//       temperature: sensorData.temperature,
//       mode: sensorData.mode,
//       powerStatus: sensorData.powerStatus,
//     });
//   }, [sensorData]);

//   useEffect(() => {
//     if (selectedService) {
//       localStorage.setItem("selectedService", JSON.stringify(selectedService));
//     }
//   }, [selectedService]);

//   const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
//   const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

//   // Fetch data for a specific PCB
//   const fetchDataForPCB = async (pcbSerialNumber) => {
//     try {
//       console.log(`📡 Fetching data for PCB: ${pcbSerialNumber}`);
//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );
//       if (!response.ok) throw new Error("Network response was not ok");

//       const data = await response.json();
//       console.log(`✅ Data received for PCB ${pcbSerialNumber}:`, data);

//       if (data.status !== "success" || !data.data) return null;
//       return data.data;
//     } catch (err) {
//       console.error(`❌ Error fetching PCB data for ${pcbSerialNumber}:`, err);
//       return null;
//     }
//   };

//   // Fetch service items and initial data
//   useEffect(() => {
//     const initialize = async () => {
//       try {
//         setLoading(true);

//         const response = await fetch(
//           `${baseURL}/service-items/?user_id=${userId}&company_id=${company_id}`
//         );
//         if (!response.ok) throw new Error("Failed to fetch service items");

//         const data = await response.json();
//         setServiceItems(data.data || []);

//         if (data.data?.length > 0) {
//           const first = data.data[0];
//           setSelectedService(first);
//           activePCBRef.current = first.pcb_serial_number;

//           setLoadingMessage("Loading device data...");
//           const deviceData = await fetchDataForPCB(first.pcb_serial_number);

//           if (deviceData) {
//             const isOnline = deviceData.is_online;
//             setSensorData({
//               outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
//               humidity: isOnline ? deviceData.room_humidity?.value : null,
//               roomTemp: isOnline ? deviceData.room_temperature?.value : null,
//               fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
//               temperature: isOnline ? deviceData.set_temperature?.value : 25,
//               powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
//               mode: deviceData.mode?.value || "3",
//               errorFlag: isOnline ? deviceData.error_flag?.value : "0",
//               hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
//               deviceId: first.pcb_serial_number,
//               alarmOccurred: deviceData.alarm_occurred?.value || "0",
//               isOnline: isOnline,
//             });

//             setDisplayData({
//               fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
//               temperature: isOnline ? deviceData.set_temperature?.value : 25,
//               mode: deviceData.mode?.value || "3",
//               powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
//             });

//             const alarmValue = deviceData.alarm_occurred?.value;
//             setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
//           }

//           setInitialDataLoaded(true);
//         }

//         setLoading(false);
//         setPullToRefresh((prev) => ({ ...prev, isRefreshing: false }));
//         setManualRefresh(false);
//       } catch (error) {
//         console.error("❌ Error during initialization:", error);
//         setLoading(false);
//         setPullToRefresh((prev) => ({ ...prev, isRefreshing: false }));
//         setManualRefresh(false);
//       }
//     };

//     initialize();
//   }, [userId, company_id]);

//   // Regular (slow) fetch against get-latest-data — used for the full record
//   // (humidity, alarms, error flag, hvac_busy, etc.) as well as the 61s background poll
//   const fetchData = async () => {
//     const pcbSerialNumber = activePCBRef.current;
//     if (!pcbSerialNumber) return;
//     if (isFetchingRef.current) return;
//     isFetchingRef.current = true;

//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );
//       if (!response.ok) throw new Error("Network response was not ok");

//       const data = await response.json();
//       if (data.status !== "success" || !data.data) return;

//       if (activePCBRef.current !== pcbSerialNumber) return;

//       const deviceData = data.data;
//       const isOnline = deviceData.is_online;

//       // ✅ get-latest-data can lag behind the events feed by 15-25s. If we
//       // recently applied a confirmed value from an event, don't let this
//       // slower/stale response stomp on it — only refresh the non-control
//       // fields until the grace window passes.
//       const withinGrace = Date.now() - lastEventConfirmedAtRef.current < CONTROL_VALUE_GRACE_MS;

//       setSensorData((prev) => ({
//         outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
//         humidity: isOnline ? deviceData.room_humidity?.value : null,
//         roomTemp: isOnline ? deviceData.room_temperature?.value : null,
//         fanSpeed: withinGrace ? prev.fanSpeed : (isOnline ? deviceData.fan_speed?.value : "0"),
//         temperature: withinGrace ? prev.temperature : (isOnline ? deviceData.set_temperature?.value : 25),
//         powerStatus: withinGrace
//           ? prev.powerStatus
//           : (isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off"),
//         mode: withinGrace ? prev.mode : (deviceData.mode?.value || "3"),
//         errorFlag: isOnline ? deviceData.error_flag?.value : "0",
//         hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
//         deviceId: pcbSerialNumber,
//         alarmOccurred: deviceData.alarm_occurred?.value || "0",
//         isOnline: isOnline,
//       }));

//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);

//       if (deviceData.hvac_busy?.value == "0") {
//         clearProcessingIfDone();
//       }
//     } catch (err) {
//       console.error("❌ Fetch error:", err);
//     } finally {
//       isFetchingRef.current = false;
//     }
//   };

//   useEffect(() => {
//     if (!initialDataLoaded || !activePCBRef.current) return;

//     fetchData();
//     fetchAllAlarms();

//     if (fetchIntervalRef.current) {
//       clearInterval(fetchIntervalRef.current);
//     }

//     fetchIntervalRef.current = setInterval(() => {
//       if (processingRef.current) {
//         console.log("⏸️ Skipping 61s poll — command processing in progress");
//         return;
//       }
//       fetchData();
//       fetchAllAlarms();
//     }, 61000);

//     return () => {
//       if (fetchIntervalRef.current) {
//         clearInterval(fetchIntervalRef.current);
//         fetchIntervalRef.current = null;
//       }
//     };
//   }, [initialDataLoaded, activePCBRef.current]);

//   const fetchAllAlarms = async () => {
//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Failed to fetch all alarms");

//       const data = await response.json();

//       if (data.status !== "success" || !data.data) return;

//       setAllDevicesData(data.data);

//       const alarmCount = data.data.reduce((count, item) => {
//         const val = item.alarm_occurred?.value;
//         if (val && val !== "0") {
//           return count + Number(val);
//         }
//         return count;
//       }, 0);

//       setDropdownAlarmCount(alarmCount);
//     } catch (err) {
//       console.error("Dropdown alarm fetch error:", err);
//     }
//   };

//   // ✅ poll the /events/filter/ endpoint for the active PCB every 5s and, as
//   // soon as an 0xA3 status event shows up whose FS / MD / SRT / on-off state
//   // matches the command we actually sent, apply it to the UI immediately —
//   // instead of blindly trusting whichever event happens to be newest (which
//   // can be a stale/intermediate state if the device is mid-transition).
//   const pollEventForUpdate = async () => {
//     const pcbSerialNumber = activePCBRef.current;
//     if (!pcbSerialNumber) return;

//     const events = await fetchEventsForPCB(pcbSerialNumber); // newest first, 0xA3 only
//     if (!events.length) return;

//     const pendingCmd = pendingCommandRef.current;

//     const match = events.find((ev) => {
//       // Skip anything we've already applied
//       if (lastEventIdRef.current !== null && Number(ev.id) <= Number(lastEventIdRef.current)) {
//         return false;
//       }
//       return eventMatchesPendingCommand(ev.parsed, pendingCmd);
//     });

//     if (!match) return; // nothing confirming our command yet — keep waiting

//     const { FS, MD, SRT, DS } = match.parsed;
//     const isOn = DS !== undefined ? DS !== "0" : undefined;

//     console.log(
//       "⚡ Matching event found for PCB:",
//       pcbSerialNumber,
//       "| event id:",
//       match.id,
//       "| created_at:",
//       match.created_at,
//       "| parsed:",
//       match.parsed
//     );

//     if (pendingCmd && pendingCmd.powerOnly) {
//       // ✅ Power toggle: only trust the derived on/off state from DS.
//       // Don't touch fanSpeed/mode/temperature — on power-off the device
//       // echoes sentinel codes (e.g. FS:3) that aren't real settings, and on
//       // power-on we already sent the correct staged values ourselves.
//       setDisplayData((prev) => ({
//         ...prev,
//         powerStatus: isOn !== undefined ? (isOn ? "on" : "off") : prev.powerStatus,
//       }));
//       setSensorData((prev) => ({
//         ...prev,
//         powerStatus: isOn !== undefined ? (isOn ? "on" : "off") : prev.powerStatus,
//       }));
//     } else {
//       setDisplayData((prev) => ({
//         ...prev,
//         fanSpeed: FS !== undefined ? FS : prev.fanSpeed,
//         mode: MD !== undefined ? MD : prev.mode,
//         temperature: SRT !== undefined ? parseInt(SRT) : prev.temperature,
//         powerStatus: isOn !== undefined ? (isOn ? "on" : "off") : prev.powerStatus,
//       }));

//       setSensorData((prev) => ({
//         ...prev,
//         fanSpeed: FS !== undefined ? FS : prev.fanSpeed,
//         mode: MD !== undefined ? MD : prev.mode,
//         temperature: SRT !== undefined ? parseInt(SRT) : prev.temperature,
//         powerStatus: isOn !== undefined ? (isOn ? "on" : "off") : prev.powerStatus,
//       }));
//     }

//     lastEventIdRef.current = match.id;
//     pendingCommandRef.current = null;
//     lastEventConfirmedAtRef.current = Date.now(); // ✅ start the grace window

//     // Confirmed from the device — no need to keep the "processing" spinner
//     // up waiting on the slower get-latest-data endpoint.
//     stopProcessing();

//     // Still reconcile the full record in the background (alarms, humidity,
//     // error flag, hvac_busy, etc.) — fetchData() will respect the grace
//     // window above and leave fanSpeed/mode/temperature/powerStatus alone.
//     fetchData();
//   };

//   // Send temperature command to device
//   const sendTemperatureCommand = async (temperature) => {
//     try {
//       const modeVal = parseInt(displayData.mode) || 3;
//       const fanVal = parseInt(displayData.fanSpeed) || 0;
//       const tempVal = parseInt(temperature) || 25;
//       const hvacVal = displayData.powerStatus === "on" ? "1" : "0";

//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: modeVal,
//         FS: fanVal,
//         SRT: tempVal,
//         HVAC: hvacVal,
//         Footer: "0xZX",
//       };

//       console.log("🌡️ Sending temperature command:", payload);

//       startProcessingCycle({ MD: modeVal, FS: fanVal, SRT: tempVal, HVAC: hvacVal });

//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!response.ok) {
//         stopProcessing();
//         throw new Error("Failed to send temperature command");
//       }

//       console.log("✅ Temperature command sent:", temperature);
//     } catch (error) {
//       console.error("Error sending temperature command:", error);
//       stopProcessing();
//     }
//   };

//   // Handle temperature change during drag
//   const handleTempChange = (newTemp) => {
//     setDisplayData((prev) => ({ ...prev, temperature: newTemp }));
//     setIsDraggingTemp(true);

//     if (displayData.powerStatus === "off") {
//       console.log(`Temperature set to ${newTemp}°C (will apply when power turns on)`);
//     }
//   };

//   const handleTempChangeEnd = useCallback((newTemp) => {
//     setIsDraggingTemp(false);
//     if (displayData.powerStatus === "on") {
//       setPendingTemperature(newTemp);
//       setShowTempConfirmDialog(true);
//     }
//   }, [displayData.powerStatus]);

//   const confirmTempChange = async () => {
//     if (pendingTemperature === null) return;
//     const tempToSend = pendingTemperature;

//     setShowTempConfirmDialog(false);
//     setPendingTemperature(null);

//     await sendTemperatureCommand(tempToSend);
//   };

//   const cancelTempChange = () => {
//     setShowTempConfirmDialog(false);
//     setPendingTemperature(null);
//     setDisplayData((prev) => ({ ...prev, temperature: sensorData.temperature }));
//   };

//   // Handle mode change
//   const handleModeChange = async (newMode) => {
//     if (processing.status || !sensorData.isOnline) return;

//     const newModeCode = MODE_CODE_MAP[newMode] || 1;
//     setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));

//     if (displayData.powerStatus === "on") {
//       await sendModeCommand(newModeCode.toString(), newMode);
//     }
//   };

//   // Send mode command
//   const sendModeCommand = async (modeCode, modeName) => {
//     try {
//       const modeVal = parseInt(modeCode) || 3;
//       const fanVal = parseInt(displayData.fanSpeed) || 0;
//       const tempVal = parseInt(displayData.temperature) || 25;
//       const hvacVal = displayData.powerStatus === "on" ? "1" : "0";

//       startProcessingCycle({ MD: modeVal, FS: fanVal, SRT: tempVal, HVAC: hvacVal });

//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: modeVal,
//         FS: fanVal,
//         SRT: tempVal,
//         HVAC: hvacVal,
//         Footer: "0xZX",
//       };

//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!response.ok) {
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }

//       console.log("✅ Mode command sent:", modeName);
//     } catch (error) {
//       console.error("Error sending mode command:", error);
//       stopProcessing();
//     }
//   };

//   // Handle fan speed change
//   const handleFanSpeedChange = async (newPosition) => {
//     if (processing.status || !sensorData.isOnline) return;

//     const newSpeed = FAN_SPEEDS[newPosition];
//     setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));

//     if (displayData.powerStatus === "on") {
//       await sendFanCommand(newSpeed);
//     } else {
//       console.log(`Fan speed set to ${newSpeed} (will apply when power turns on)`);
//     }
//   };

//   // Send fan command
//   const sendFanCommand = async (fanSpeed) => {
//     try {
//       const modeVal = parseInt(displayData.mode) || 3;
//       const fanVal = parseInt(fanSpeed) || 0;
//       const tempVal = parseInt(displayData.temperature) || 25;
//       const hvacVal = displayData.powerStatus === "on" ? "1" : "0";

//       startProcessingCycle({ MD: modeVal, FS: fanVal, SRT: tempVal, HVAC: hvacVal });

//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: modeVal,
//         FS: fanVal,
//         SRT: tempVal,
//         HVAC: hvacVal,
//         Footer: "0xZX",
//       };

//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!response.ok) {
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }

//       console.log("✅ Fan command sent:", fanSpeed);
//     } catch (error) {
//       console.error("Error sending fan command:", error);
//       stopProcessing();
//     }
//   };

//   // Handle fan click on slider
//   const handleFanClick = (e) => {
//     if (processing.status || !sensorData.isOnline) return;
//     const containerWidth = e.currentTarget.offsetWidth;
//     const clickPosition = e.nativeEvent.offsetX;
//     const segmentWidth = containerWidth / 3;
//     const newPosition = Math.min(2, Math.floor(clickPosition / segmentWidth));
//     handleFanSpeedChange(newPosition);
//   };

//   // Start progressive message cycle + fast events polling.
//   // pendingCmd: { MD, FS, SRT, HVAC } — the exact command we just sent, used
//   // to confirm the RIGHT event (not just any new event) came back.
//   const startProcessingCycle = (pendingCmd = null) => {
//     // Clear any stale timers from a previous cycle
//     if (processingTimerRef.current) {
//       clearInterval(processingTimerRef.current);
//       processingTimerRef.current = null;
//     }
//     if (hardStopTimerRef.current) {
//       clearTimeout(hardStopTimerRef.current);
//       hardStopTimerRef.current = null;
//     }
//     if (processingPollRef.current) {
//       clearInterval(processingPollRef.current);
//       processingPollRef.current = null;
//     }
//     if (eventsPollRef.current) {
//       clearInterval(eventsPollRef.current);
//       eventsPollRef.current = null;
//     }

//     hasStoppedRef.current = false;
//     processingMsgIndexRef.current = 0;
//     processingStartTimeRef.current = Date.now();
//     // ✅ Do NOT reset lastEventIdRef here. It must stay persistent across
//     // commands so a new command can only match an event with a strictly
//     // higher id than the last one we already applied — otherwise an older,
//     // already-superseded event that happens to share the same FS/MD/SRT as
//     // the new target could be matched by mistake (e.g. confirming FS:0 with
//     // an event id that's actually older than the previous FS:2 confirmation).
//     pendingCommandRef.current = pendingCmd;
//     setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

//     // Message cycle — purely cosmetic progress text
//     processingTimerRef.current = setInterval(() => {
//       processingMsgIndexRef.current += 1;
//       const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
//       if (nextMsg) {
//         setProcessing({ status: true, message: nextMsg });
//       }
//     }, 10000);

//     // ✅ poll /events/filter/ every 5s — event arrival time varies (10s, 15s,
//     // 25s, 30s...), so we keep checking every 5s until the matching status
//     // event for this exact command shows up.
//     eventsPollRef.current = setInterval(() => {
//       pollEventForUpdate();
//     }, EVENTS_POLL_INTERVAL);

//     // Slow background poll against get-latest-data as a secondary fallback
//     processingPollRef.current = setInterval(() => {
//       fetchData();
//     }, 40000);

//     // Absolute safety net — exit processing regardless, after 60s
//     hardStopTimerRef.current = setTimeout(() => {
//       stopProcessing();
//       console.log("🔄 Hard stop timer triggered (60s elapsed), fetching fresh data...");
//       fetchData();
//     }, 60000);
//   };

//   const stopProcessing = () => {
//     if (hasStoppedRef.current) return;
//     hasStoppedRef.current = true;

//     if (processingTimerRef.current) {
//       clearInterval(processingTimerRef.current);
//       processingTimerRef.current = null;
//     }
//     if (hardStopTimerRef.current) {
//       clearTimeout(hardStopTimerRef.current);
//       hardStopTimerRef.current = null;
//     }
//     if (processingPollRef.current) {
//       clearInterval(processingPollRef.current);
//       processingPollRef.current = null;
//     }
//     if (eventsPollRef.current) {          // clear the fast events poll too
//       clearInterval(eventsPollRef.current);
//       eventsPollRef.current = null;
//     }
//     pendingCommandRef.current = null;

//     setProcessing({ status: false, message: "" });
//     console.log("🔄 Processing stopped.");
//   };

//   const clearProcessingIfDone = () => {
//     if (hasStoppedRef.current) return;
//     if (processingTimerRef.current || hardStopTimerRef.current) {
//       const elapsed = Date.now() - (processingStartTimeRef.current || 0);
//       if (elapsed >= MIN_PROCESSING_TIME) {
//         stopProcessing();
//       }
//     }
//   };

//   useEffect(() => {
//     return () => {
//       if (processingTimerRef.current) clearInterval(processingTimerRef.current);
//       if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
//       if (processingPollRef.current) clearInterval(processingPollRef.current);
//       if (eventsPollRef.current) clearInterval(eventsPollRef.current); // ✅
//     };
//   }, []);

//   useEffect(() => {
//     if (selectedService?.pcb_serial_number) {
//       console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
//       activePCBRef.current = selectedService.pcb_serial_number;
//     }
//   }, [selectedService?.pcb_serial_number]);

//   const sendRefreshToController = async () => {
//     if (!selectedService?.pcb_serial_number) {
//       setRefreshStatus({ sending: false, success: false, message: "No device selected" });
//       return { success: false };
//     }
//     try {
//       const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
//       if (result.success) {
//         setRefreshStatus({ sending: false, success: true, message: "Refresh sent successfully" });
//         setTimeout(() => setRefreshStatus({ sending: false, success: false, message: "" }), 3000);
//         return result;
//       }
//       const msg = result?.error || result?.message || "Failed to send refresh command";
//       setRefreshStatus({ sending: false, success: false, message: msg });
//       setTimeout(() => setRefreshStatus({ sending: false, success: false, message: "" }), 2000);
//       return result;
//     } catch (error) {
//       setRefreshStatus({ sending: false, success: false, message: error.message || "Unexpected error" });
//       return { success: false };
//     }
//   };

//   const handleTouchStart = (e) => {
//     if (e.target.closest && e.target.closest(".temp-container")) return;
//     touchStartY.current = e.touches[0].clientY;
//   };

//   const handleTouchMove = (e) => {
//     if (e.target.closest && e.target.closest(".temp-container")) return;
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
//     const pullDistance = e.touches[0].clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({ isPulling: true, pullDistance: Math.min(pullDistance, MAX_PULL), isRefreshing: false });
//     }
//   };

//   const handleTouchEnd = async () => {
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleMouseDown = (e) => {
//     if (e.target.closest && e.target.closest(".temp-container")) return;
//     touchStartY.current = e.clientY;
//     document.addEventListener("mousemove", handleMouseMove);
//     document.addEventListener("mouseup", handleMouseUp);
//   };
//   const handleMouseMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
//     const pullDistance = e.clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({ isPulling: true, pullDistance: Math.min(pullDistance, MAX_PULL), isRefreshing: false });
//     }
//   };

//   const handleMouseUp = async () => {
//     document.removeEventListener("mousemove", handleMouseMove);
//     document.removeEventListener("mouseup", handleMouseUp);
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleLogout = () => {
//     logout();
//     navigate("/");
//   };

//   const handlePowerToggle = async () => {
//     try {
//       if (processing.status || sensorData.hvacBusy == "1") {
//         const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
//         setProcessing({ status: true, message: msg });
//         return;
//       }

//       const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
//       const isShutdown = displayData?.fanSpeed == 3 || displayData?.mode == 0;

//       const modeVal = isShutdown ? "3" : displayData.mode;
//       const fanVal = isShutdown ? "0" : displayData.fanSpeed;
//       const tempVal = displayData.temperature;

//       startProcessingCycle({
//         HVAC: newHvacValue,
//         powerOnly: true, // ✅ match purely on on/off state — device echoes a
//         // sentinel FS (e.g. FS:3) on power-off that won't equal the fan
//         // speed we sent, so FS/MD/SRT must not be part of the match here.
//       });

//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: modeVal,
//         FS: fanVal,
//         SRT: tempVal,
//         HVAC: newHvacValue,
//         Footer: "0xZX",
//       };

//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!response.ok) {
//         console.error("❌ API error:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }

//       const result = await response.text();
//       console.log("✅ Command sent:", result);
//     } catch (error) {
//       console.error("🔥 Power toggle error:", error.message);
//       stopProcessing();
//     }
//   };

//   const handleNavigation = (path) => {
//     if (!processing.status) navigate(path);
//   };

//   // Handle service selection with confirmation
//   const handleServiceSelect = (item) => {
//     if (selectedService?.service_item_id === item.service_item_id) {
//       setShowServiceDropdown(false);
//       return;
//     }

//     setPendingService(item);
//     setShowConfirmDialog(true);
//     setShowServiceDropdown(false);
//   };

//   // Confirm and execute service switch with data fetching
//   const confirmServiceSwitch = async () => {
//     if (!pendingService) return;

//     setShowConfirmDialog(false);
//     setSwitchingService(true);
//     setSwitchingProgress(0);

//     try {
//       setLoadingMessage(SWITCHING_MESSAGES[0]);
//       setSwitchingProgress(10);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       activePCBRef.current = pendingService.pcb_serial_number;
//       lastEventIdRef.current = null; // reset event tracking for the new PCB
//       pendingCommandRef.current = null;
//       lastEventConfirmedAtRef.current = 0; // no grace window carried over to the new device

//       setLoadingMessage(SWITCHING_MESSAGES[1]);
//       setSwitchingProgress(30);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const deviceData = await fetchDataForPCB(pendingService.pcb_serial_number);

//       if (!deviceData) {
//         setLoadingMessage("Connected but no data available");
//         setSwitchingProgress(70);
//         await new Promise(resolve => setTimeout(resolve, 500));

//         setSelectedService(pendingService);
//         setSwitchingProgress(100);
//         setSwitchingService(false);
//         setLoadingMessage("");

//         setSwitchNotification({
//           show: true,
//           message: `Connected to ${pendingService.service_item_name}`
//         });

//         setTimeout(() => {
//           setSwitchNotification({ show: false, message: "" });
//         }, 3000);
//         return;
//       }

//       setLoadingMessage(SWITCHING_MESSAGES[2]);
//       setSwitchingProgress(50);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const isOnline = deviceData.is_online;
//       setSensorData({
//         outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
//         humidity: isOnline ? deviceData.room_humidity?.value : null,
//         roomTemp: isOnline ? deviceData.room_temperature?.value : null,
//         fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
//         temperature: isOnline ? deviceData.set_temperature?.value : 25,
//         powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
//         mode: deviceData.mode?.value || "3",
//         errorFlag: isOnline ? deviceData.error_flag?.value : "0",
//         hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
//         deviceId: pendingService.pcb_serial_number,
//         alarmOccurred: deviceData.alarm_occurred?.value || "0",
//         isOnline: isOnline,
//       });

//       setDisplayData({
//         fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
//         temperature: isOnline ? deviceData.set_temperature?.value : 25,
//         mode: deviceData.mode?.value || "3",
//         powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
//       });

//       setLoadingMessage(SWITCHING_MESSAGES[3]);
//       setSwitchingProgress(70);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);

//       setLoadingMessage(SWITCHING_MESSAGES[4]);
//       setSwitchingProgress(85);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       setSelectedService(pendingService);

//       setLoadingMessage(SWITCHING_MESSAGES[5]);
//       setSwitchingProgress(100);
//       await new Promise(resolve => setTimeout(resolve, 500));

//       setSwitchingService(false);
//       setLoadingMessage("");

//       setSwitchNotification({
//         show: true,
//         message: `Successfully switched to ${pendingService.service_item_name}`
//       });

//       setTimeout(() => {
//         setSwitchNotification({ show: false, message: "" });
//       }, 3000);

//     } catch (error) {
//       console.error("❌ Error switching service:", error);
//       setSwitchingService(false);
//       setLoadingMessage("");

//       setSelectedService(pendingService);
//       setSwitchNotification({
//         show: true,
//         message: `Switched to ${pendingService.service_item_name}`
//       });

//       setTimeout(() => {
//         setSwitchNotification({ show: false, message: "" });
//       }, 3000);
//     }
//   };

//   const cancelServiceSwitch = () => {
//     setShowConfirmDialog(false);
//     setPendingService(null);
//   };

//   const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;
//   const getModeDescription = (code) => MODE_MAP[code] || "Fan";

//   const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
//   const indicatorRotation = pullProgress * 360;
//   const indicatorOpacity = pullProgress;

//   if (loading || !initialDataLoaded) {
//     return <Loading onLogout={handleLogout} message="Loading device data..." />;
//   }

//   if (!loading && serviceItems.length === 0 && !manualRefresh) {
//     return <NoServiceItems onLogout={handleLogout} onNavigateHome={() => navigate("/home")} />;
//   }

//   return (
//     <div
//       className="mainmain-container"
//       style={{ backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)", touchAction: "pan-y" }}
//       ref={containerRef}
//       onTouchStart={handleTouchStart}
//       onTouchMove={handleTouchMove}
//       onTouchEnd={handleTouchEnd}
//       onMouseDown={handleMouseDown}
//     >

//       {(pullToRefresh.isPulling || pullToRefresh.isRefreshing) && (
//         <div className="pull-refresh-blocking-overlay" />
//       )}

//       {(pullToRefresh.isPulling || pullToRefresh.isRefreshing) && (
//         <div className="pull-refresh-popup">
//           {pullToRefresh.isRefreshing ? (
//             <>
//               <div className="screen1-refresh-spinner"></div>
//               <span>Sending refresh command...</span>
//             </>
//           ) : (
//             <>
//               <FiRefreshCw
//                 size={18}
//                 style={{
//                   transform: `rotate(${indicatorRotation}deg)`,
//                   transition: "transform 0.2s ease",
//                   opacity: indicatorOpacity,
//                 }}
//               />
//               <span>
//                 {pullToRefresh.pullDistance >= PULL_THRESHOLD ? "Release to refresh" : "Pull down to refresh"}
//               </span>
//             </>
//           )}
//         </div>
//       )}

//       <div className="main-container">
//         {refreshStatus.message && (
//           <div className={`refresh-status-toast ${refreshStatus.success ? "success" : "error"}`}>
//             {refreshStatus.message}
//           </div>
//         )}

//         {switchNotification.show && (
//           <div className="switch-notification">
//             <span>✅</span>
//             <span>{switchNotification.message}</span>
//           </div>
//         )}

//         {showConfirmDialog && (
//           <div className="confirm-dialog-overlay">
//             <div className="confirm-dialog">
//               <div className="confirm-dialog-content">
//                 <h3>Switch Service?</h3>
//                 <p>Are you sure you want to switch to <strong>{pendingService?.service_item_name}</strong>?</p>
//                 <div className="confirm-dialog-buttons">
//                   <button
//                     className="confirm-dialog-btn confirm-btn-yes"
//                     onClick={confirmServiceSwitch}
//                   >
//                     Yes, Switch
//                   </button>
//                   <button
//                     className="confirm-dialog-btn confirm-btn-no"
//                     onClick={cancelServiceSwitch}
//                   >
//                     Cancel
//                   </button>
//                 </div>
//               </div>
//             </div>
//           </div>
//         )}

//         {showTempConfirmDialog && (
//           <div className="confirm-dialog-overlay">
//             <div className="confirm-dialog">
//               <div className="confirm-dialog-content">
//                 <h3>Change Temperature?</h3>
//                 <p>
//                   Set temperature to <strong>{pendingTemperature}°C</strong>?
//                 </p>
//                 <div className="confirm-dialog-buttons">
//                   <button
//                     className="confirm-dialog-btn confirm-btn-yes"
//                     onClick={confirmTempChange}
//                   >
//                     Yes, Set
//                   </button>
//                   <button
//                     className="confirm-dialog-btn confirm-btn-no"
//                     onClick={cancelTempChange}
//                   >
//                     Cancel
//                   </button>
//                 </div>
//               </div>
//             </div>
//           </div>
//         )}

//         {switchingService && (
//           <div className="service-switching-overlay">
//             <div className="service-switching-content">
//               <div className="switching-spinner"></div>
//               <p className="switching-message">{loadingMessage}</p>
//               <div className="switching-progress-bar">
//                 <div
//                   className="switching-progress-fill"
//                   style={{ width: `${switchingProgress}%` }}
//                 ></div>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Header: Service Dropdown + Power Button Row */}
//         <div className="header-controls-row">
//           <div className="service-dropdown-wrapper">
//             <div className="service-dropdown-container">
//               <div
//                 className="service-dropdown-header"
//                 onClick={() => setShowServiceDropdown(!showServiceDropdown)}
//                 style={{ position: "relative" }}
//               >
//                 <span>
//                   {selectedService ? selectedService.service_item_name : "Select Service"}
//                 </span>

//                 {dropdownAlarmCount > 0 && (
//                   <span
//                     style={{
//                       position: "absolute",
//                       top: "0px",
//                       right: "28px",
//                       backgroundColor: "red",
//                       color: "white",
//                       borderRadius: "50%",
//                       width: "18px",
//                       height: "18px",
//                       display: "flex",
//                       alignItems: "center",
//                       justifyContent: "center",
//                       fontSize: "10px",
//                       fontWeight: "bold",
//                     }}
//                   >
//                     {dropdownAlarmCount}
//                   </span>
//                 )}

//                 <FiChevronDown size={18} />
//               </div>
//               {showServiceDropdown && (
//                 <div className="service-dropdown-list">
//                   {serviceItems.map((item) => {
//                     const itemAlarmCount = getAlarmCountForItem(item, allDevicesData);

//                     return (
//                       <div
//                         key={item.service_item_id}
//                         className={`service-dropdown-item ${
//                           selectedService?.service_item_id === item.service_item_id ? "active" : ""
//                         }`}
//                         onClick={() => handleServiceSelect(item)}
//                         style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
//                       >
//                         <span>{item.service_item_name}</span>
//                         <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
//                           {selectedService?.service_item_id === item.service_item_id && (
//                             <span style={{ color: "#3E99ED" }}>✓</span>
//                           )}
//                           {itemAlarmCount > 0 && (
//                             <span
//                               style={{
//                                 backgroundColor: "red",
//                                 color: "white",
//                                 borderRadius: "50%",
//                                 width: "20px",
//                                 height: "20px",
//                                 display: "flex",
//                                 alignItems: "center",
//                                 justifyContent: "center",
//                                 fontSize: "10px",
//                                 fontWeight: "bold",
//                                 minWidth: "20px",
//                               }}
//                             >
//                               {itemAlarmCount}
//                             </span>
//                           )}
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           </div>

//           <div style={{ position: "relative" }}>
//             <button
//               className={`screen1-power-button ${processing.status ? "processing" : ""}`}
//               onClick={handlePowerToggle}
//               disabled={isControlDisabled()}
//               style={{
//                 backgroundColor: !sensorData.isOnline
//                   ? "#808080"
//                   : sensorData.powerStatus == "on"
//                   ? "#5adb5eff"
//                   : "#c80000f5",
//                 display: "flex",
//                 alignItems: "center",
//                 justifyContent: "center",
//                 border: "none",
//                 height: "48px",
//                 width: "48px",
//                 borderRadius: "20px",
//                 padding: "8px",
//                 cursor: isControlDisabled() ? "not-allowed" : "pointer",
//                 fontWeight: "bold",
//                 opacity: isControlDisabled() ? 0.6 : 1,
//               }}
//             >
//               <FiPower size={24} color="#fff" />
//               {processing.status && <span className="screen1-processing-indicator"></span>}
//             </button>
//             {sensorData.errorFlag == "1" && <div className="error-indicator" />}
//           </div>
//         </div>

//         <div className="logo-container">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
//         </div>

//         <div style={{
//           pointerEvents: isControlDisabled() ? "none" : "auto",
//           opacity: isControlDisabled() ? 0.35 : 1
//         }}>
//           <TemperatureDial
//             onTempChange={handleTempChange}
//             onTempChangeEnd={handleTempChangeEnd}
//             fanSpeed={fanPosition}
//             initialTemperature={displayData.temperature ?? 25}
//             disabled={isControlDisabled()}
//           />
//         </div>

//         {!sensorData.isOnline && (
//           <div
//             style={{
//               color: "rgba(0,0,0,0.55)",
//               backgroundColor: "#fff",
//               textAlign: "center",
//               padding: "10px 20px",
//               borderRadius: "10px",
//               margin: "12px 20px 4px 20px",
//               fontSize: "14px",
//               fontWeight: "bold",
//               letterSpacing: "0.5px",
//               display: "flex",
//               alignItems: "center",
//               justifyContent: "center",
//               gap: "8px",
//             }}
//           >
//             <span>📴</span>
//             <span>System is Offline</span>
//           </div>
//         )}

//         {processing.status && (
//           <div className="screen1-processing-message">{processing.message}</div>
//         )}

//         {sensorData.errorFlag == "1" && (
//           <div className="screen1-error-message">⚠️ System Error Detected - Control Disabled</div>
//         )}

//         {sensorData.hvacBusy == "1" && !processing.status && (
//           <div className="screen1-busy-message">⏳ System is currently busy - Control Disabled</div>
//         )}

//         <div className="env-info">
//           <div className="env-item">
//             <FiSun className="env-icon" size={20} color="#FFFFFF" />
//             <div className="env-value">
//               {sensorData.isOnline ? `${formatTemp(sensorData.outsideTemp)}°C` : "—"}
//             </div>
//             <div className="env-label">Outside Temp</div>
//           </div>
//           <div className="env-item">
//             <FiThermometer className="env-icon" size={20} color="#FFFFFF" />
//             <div className="env-value">
//               {sensorData.isOnline ? `${formatTemp(sensorData.roomTemp)}°C` : "—"}
//             </div>
//             <div className="env-label">Room Temp</div>
//           </div>
//           <div className="env-item">
//             <FiDroplet className="env-icon" size={20} color="#FFFFFF" />
//             <div className="env-value">
//               {sensorData.isOnline ? `${formatTemp(sensorData.humidity)}%` : "—"}
//             </div>
//             <div className="env-label">Humidity</div>
//           </div>
//         </div>
//       </div>

//       {/* Footer */}
//       <div className="footer-container">
//         <div className="modes-section-in-footer">
//           <h3 className="modes-heading">Modes</h3>
//           <div className="modes-row">
//             {Object.values(MODE_MAP).map((mode) => (
//               <button
//                 key={mode}
//                 onClick={() => handleModeChange(mode)}
//                 className={`modes-button ${
//                   currentModeDescription === mode ? "modes-button-selected" : ""
//                 }`}
//                 disabled={isControlDisabled()}
//                 style={{
//                   opacity: isControlDisabled() ? 0.6 : 1,
//                   cursor: isControlDisabled() ? "not-allowed" : "pointer",
//                 }}
//               >
//                 <span
//                   className={`modes-text ${
//                     currentModeDescription === mode ? "modes-text-selected" : ""
//                   }`}
//                 >
//                   {mode}
//                 </span>
//               </button>
//             ))}
//           </div>
//         </div>

//         <div className="fan-speed-section-in-footer">
//           <h3 className="fan-speed-heading">Fan Speed</h3>
//           <div className="fan-speed-buttons-row">
//             {FAN_LABELS.map((label, index) => (
//               <button
//                 key={label}
//                 onClick={() => handleFanSpeedChange(index)}
//                 className={`fan-speed-button ${
//                   fanPosition === index ? "fan-speed-button-selected" : ""
//                 }`}
//                 disabled={isControlDisabled()}
//                 style={{
//                   opacity: isControlDisabled() ? 0.6 : 1,
//                   cursor: isControlDisabled() ? "not-allowed" : "pointer",
//                 }}
//               >
//                 <span
//                   className={`fan-speed-text ${
//                     fanPosition === index ? "fan-speed-text-selected" : ""
//                   }`}
//                 >
//                   {label}
//                 </span>
//               </button>
//             ))}
//           </div>
//         </div>

//         <div className="control-buttons">
//           <button
//             className={`control-btn ${!hasValidPCBSerial ? "screen1-disabled-btn" : ""}`}
//             disabled={!hasValidPCBSerial}
//             title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
//           >
//           </button>

//           <button
//             className="control-btn"
//             onClick={() =>
//               navigate("/alarms", {
//                 state: {
//                   alarmData: {
//                     alarmOccurred: sensorData.alarmOccurred,
//                     errorCount: errorCount,
//                     deviceId: sensorData.deviceId,
//                   },
//                   userId: userId,
//                   company_id: company_id,
//                 },
//               })
//             }
//           >
//             <div style={{ position: "relative" }}>
//               <FiClock size={20} />
//               {errorCount > 0 && (
//                 <span
//                   style={{
//                     position: "absolute",
//                     top: "-8px",
//                     right: "-23px",
//                     backgroundColor: "red",
//                     color: "white",
//                     borderRadius: "50%",
//                     width: "18px",
//                     height: "18px",
//                     display: "flex",
//                     alignItems: "center",
//                     justifyContent: "center",
//                     fontSize: "10px",
//                     fontWeight: "bold",
//                   }}
//                 >
//                   {errorCount}
//                 </span>
//               )}
//             </div>
//             <span>Alarms</span>
//           </button>

//           <button className="control-btn" onClick={() => handleNavigation("/timers")}>
//             <FiWatch size={20} />
//             <span>Timers</span>
//           </button>

//           <button className="control-btn" onClick={() => handleNavigation("/settings")}>
//             <FiSettings size={20} />
//             <span>Settings</span>
//           </button>

//           <button className="control-btn" onClick={() => handleNavigation("/machine")}>
//             <FiZap size={20} />
//             <span>Services</span>
//           </button>

//           <button className="control-btn" onClick={handleLogout}>
//             <FiLogOut size={20} />
//             <span>Logout</span>
//           </button>
//         </div>

//         <div className="footer-logo">
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" style={{ marginTop: "-12px" }} />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Screen1;







import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import {
  FiPower,
  FiWind,
  FiClock,
  FiWatch,
  FiSettings,
  FiZap,
  FiLogOut,
  FiSun,
  FiDroplet,
  FiThermometer,
  FiRefreshCw,
  FiChevronDown,
} from "react-icons/fi";
import { FaFan } from "react-icons/fa";
import "./Screen1.css";
import AIROlogo from "./Images/AIRO.png";
import greenAire from "./Images/greenAire.png";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../AuthContext/AuthContext";
import TemperatureDial from "./TemperatureDial";
import baseURL from "../../ApiUrl/Apiurl";
import NoServiceItems from "./NoServiceItems";
import Loading from "./Loading";


// Constants
const MODE_MAP = {
  1: "IDEC",
  2: "Auto",
  3: "Fan",
  4: "Indirect",
  5: "Direct",
};

const MODE_CODE_MAP = {
  IDEC: 1,
  Auto: 2,
  Fan: 3,
  Indirect: 4,
  Direct: 5,
};

const FAN_SPEEDS = ["0", "1", "2"];
const FAN_LABELS = ["High", "Medium", "Low"];

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

const PROCESSING_MESSAGES = [
  "1/6 Sending request...",
  "2/6 Connecting to device...",
  "3/6 Applying changes...",
  "4/6 Syncing settings...",
  "5/6 Confirming status...",
  "6/6 Finalizing...",
];

const SWITCHING_MESSAGES = [
  "Connecting to device...",
  "Fetching data from Machine...",
  "Processing device information...",
  "Updating system status...",
  "Finalizing connection...",
  "Connected successfully!",
];

const getStoredService = () => {
  try {
    const stored = localStorage.getItem("selectedService");
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    return null;
  }
};

const formatTemp = (temp) => {
  if (temp == null) return "0.0";
  const num = parseFloat(temp);
  return isNaN(num) ? "0.0" : num.toFixed(1);
};

const sendRefreshCommand = async (pcbSerialNumber, sensorData) => {
  const payload = {
    Header: "0xAA",
    DI: pcbSerialNumber || "2411GM-0102",
    MD: sensorData.mode || "3",
    FS: sensorData.fanSpeed || "0",
    SRT: sensorData.temperature || 25,
    HVAC: "3",
    Footer: "0xZX",
  };
  console.group("🔁 REFRESH COMMAND");
  console.log("📦 Payload:", payload);
  console.groupEnd();
  try {
    const response = await fetch("https://mdata.air2o.net/controllers/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }
    if (!response.ok) {
      return {
        success: false,
        error: responseBody?.error || responseBody?.message || "Command rejected by server",
        status: response.status,
      };
    }
    return { success: true, data: responseBody };
  } catch (error) {
    return { success: false, error: "Network error or server unreachable" };
  }
};




const getAlarmCountForItem = (item, allDevicesData) => {
  if (!allDevicesData || !item) return 0;
  const deviceData = allDevicesData.find(d => d.service_item_id === item.service_item_id);
  if (!deviceData) return 0;
  const alarmValue = deviceData.alarm_occurred?.value;
  return alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0;
};

const Screen1 = () => {
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
  const fetchIntervalRef = useRef(null);

  const processingTimerRef = useRef(null);
  const processingMsgIndexRef = useRef(0);
  const hardStopTimerRef = useRef(null);

  const [serviceItems, setServiceItems] = useState([]);
  const [selectedService, setSelectedService] = useState(getStoredService());
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [processing, setProcessing] = useState({ status: false, message: "" });
  const [errorCount, setErrorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [manualRefresh, setManualRefresh] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState({
    sending: false,
    success: false,
    message: "",
  });
  const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false); // ✅ NEW: Track initial data loads

  const processingStartTimeRef = useRef(null);
  const MIN_PROCESSING_TIME = 5000;
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
    isOnline: true,
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

  const [isDraggingTemp, setIsDraggingTemp] = useState(false);

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

  // Fetch data for a specific PCB
  const fetchDataForPCB = async (pcbSerialNumber) => {
    try {
      console.log(`📡 Fetching data for PCB: ${pcbSerialNumber}`);
      const response = await fetch(
        `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
      );
      if (!response.ok) throw new Error("Network response was not ok");
      
      const data = await response.json();
      console.log(`✅ Data received for PCB ${pcbSerialNumber}:`, data);
      
      if (data.status !== "success" || !data.data) return null;
      return data.data;
    } catch (err) {
      console.error(`❌ Error fetching PCB data for ${pcbSerialNumber}:`, err);
      return null;
    }
  };

  // ✅ MODIFIED: Fetch service items and initial data
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        
        // Step 1: Fetch service items
        const response = await fetch(
          `${baseURL}/service-items/?user_id=${userId}&company_id=${company_id}`
        );
        if (!response.ok) throw new Error("Failed to fetch service items");

        const data = await response.json();
        setServiceItems(data.data || []);

        if (data.data?.length > 0) {
          // Step 2: Get the first service
          const first = data.data[0];
          setSelectedService(first);
          activePCBRef.current = first.pcb_serial_number;
          
          // Step 3: Fetch data for the first service
          setLoadingMessage("Loading device data...");
          const deviceData = await fetchDataForPCB(first.pcb_serial_number);
          
          if (deviceData) {
            // Step 4: Update sensor data with real values
            const isOnline = deviceData.is_online;
            setSensorData({
              outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
              humidity: isOnline ? deviceData.room_humidity?.value : null,
              roomTemp: isOnline ? deviceData.room_temperature?.value : null,
              fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
              temperature: isOnline ? deviceData.set_temperature?.value : 25,
              powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
              mode: deviceData.mode?.value || "3",
              errorFlag: isOnline ? deviceData.error_flag?.value : "0",
              hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
              deviceId: first.pcb_serial_number,
              alarmOccurred: deviceData.alarm_occurred?.value || "0",
              isOnline: isOnline,
            });

            // Update display data
            setDisplayData({
              fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
              temperature: isOnline ? deviceData.set_temperature?.value : 25,
              mode: deviceData.mode?.value || "3",
              powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
            });

            // Update error count
            const alarmValue = deviceData.alarm_occurred?.value;
            setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
          }
          
          setInitialDataLoaded(true); // ✅ Mark initial data as loaded
        }

        setLoading(false);
        setPullToRefresh((prev) => ({ ...prev, isRefreshing: false }));
        setManualRefresh(false);
        
      } catch (error) {
        console.error("❌ Error during initialization:", error);
        setLoading(false);
        setPullToRefresh((prev) => ({ ...prev, isRefreshing: false }));
        setManualRefresh(false);
      }
    };

    initialize();
  }, [userId, company_id]); // Run only when userId or company_id changes

  // ✅ MODIFIED: Fetch data for polling (only after initial data is loaded)
 const fetchData = async () => {
  const pcbSerialNumber = activePCBRef.current;
  if (!pcbSerialNumber) return;
  if (isFetchingRef.current) return; // ✅ block overlapping calls
  isFetchingRef.current = true;

  try {
    const response = await fetch(
      `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
    );
    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();
    if (data.status !== "success" || !data.data) return;

    if (activePCBRef.current !== pcbSerialNumber) return;

    const deviceData = data.data;
    const isOnline = deviceData.is_online;

    setSensorData({
      outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
      humidity: isOnline ? deviceData.room_humidity?.value : null,
      roomTemp: isOnline ? deviceData.room_temperature?.value : null,
      fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
      temperature: isOnline ? deviceData.set_temperature?.value : 25,
      powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
      mode: deviceData.mode?.value || "3",
      errorFlag: isOnline ? deviceData.error_flag?.value : "0",
      hvacBusy: isOnline ? deviceData.hvac_busy?.value : "0",
      deviceId: pcbSerialNumber,
      alarmOccurred: deviceData.alarm_occurred?.value || "0",
      isOnline: isOnline,
    });

    const alarmValue = deviceData.alarm_occurred?.value;
    setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);

    if (deviceData.hvac_busy?.value == "0") {
      clearProcessingIfDone();
    }
  } catch (err) {
    console.error("❌ Fetch error:", err);
  } finally {
    isFetchingRef.current = false; // ✅ always release the lock
  }
};

  useEffect(() => {
  if (!initialDataLoaded || !activePCBRef.current) return;

  fetchData();
  fetchAllAlarms();

  if (fetchIntervalRef.current) {
    clearInterval(fetchIntervalRef.current);
  }

  fetchIntervalRef.current = setInterval(() => {
    if (processingRef.current) {
      console.log("⏸️ Skipping 61s poll — command processing in progress");
      return; // don't touch fetchData/fetchAllAlarms while a command is in flight
    }
    fetchData();
    fetchAllAlarms();
  }, 61000);

  return () => {
    if (fetchIntervalRef.current) {
      clearInterval(fetchIntervalRef.current);
      fetchIntervalRef.current = null;
    }
  };
}, [initialDataLoaded, activePCBRef.current]);


const fetchAllAlarms = async () => {
  try {
    const response = await fetch(
      `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
    );

    if (!response.ok) throw new Error("Failed to fetch all alarms");

    const data = await response.json();

    if (data.status !== "success" || !data.data) return;

    // Store the full data for individual alarm counts
    setAllDevicesData(data.data);

    const alarmCount = data.data.reduce((count, item) => {
      const val = item.alarm_occurred?.value;
      if (val && val !== "0") {
        return count + Number(val);
      }
      return count;
    }, 0);

    setDropdownAlarmCount(alarmCount);
  } catch (err) {
    console.error("Dropdown alarm fetch error:", err);
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
      startProcessingCycle();
      
      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
        MD: parseInt(modeCode) || 3,
        FS: parseInt(displayData.fanSpeed) || 0,
        SRT: parseInt(displayData.temperature) || 25,
        HVAC: displayData.powerStatus === "on" ? "1" : "0",
        Footer: "0xZX",
      };
      
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
      startProcessingCycle();
      
      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
        MD: parseInt(displayData.mode) || 3,
        FS: parseInt(fanSpeed) || 0,
        SRT: parseInt(displayData.temperature) || 25,
        HVAC: displayData.powerStatus === "on" ? "1" : "0",
        Footer: "0xZX",
      };
      
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

  // Handle fan click on slider
  const handleFanClick = (e) => {
    if (processing.status || !sensorData.isOnline) return;
    const containerWidth = e.currentTarget.offsetWidth;
    const clickPosition = e.nativeEvent.offsetX;
    const segmentWidth = containerWidth / 3;
    const newPosition = Math.min(2, Math.floor(clickPosition / segmentWidth));
    handleFanSpeedChange(newPosition);
  };

  // Start progressive message cycle
const startProcessingCycle = () => {
  // Clear any stale timers from a previous cycle
  if (processingTimerRef.current) {
    clearInterval(processingTimerRef.current);
    processingTimerRef.current = null;
  }
  if (hardStopTimerRef.current) {
    clearTimeout(hardStopTimerRef.current);
    hardStopTimerRef.current = null;
  }
  if (processingPollRef.current) {
    clearInterval(processingPollRef.current);
    processingPollRef.current = null;
  }

  hasStoppedRef.current = false;
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
    fetchData(); // fetchData -> sees hvac_busy=="0" -> clearProcessingIfDone -> stopProcessing (early exit)
  }, 40000); // check every 10s; tune as you like (e.g. 3000-8000)

  // Absolute safety net — exit processing regardless, after 60s
  hardStopTimerRef.current = setTimeout(() => {
    stopProcessing();
    console.log("🔄 Hard stop timer triggered (60s elapsed), fetching fresh data...");
  }, 60000);
};

const stopProcessing = () => {
  if (hasStoppedRef.current) return;
  hasStoppedRef.current = true;

  if (processingTimerRef.current) {
    clearInterval(processingTimerRef.current);
    processingTimerRef.current = null;
  }
  if (hardStopTimerRef.current) {
    clearTimeout(hardStopTimerRef.current);
    hardStopTimerRef.current = null;
  }
  if (processingPollRef.current) {           // ✅ clear the fast poll too
    clearInterval(processingPollRef.current);
    processingPollRef.current = null;
  }

  setProcessing({ status: false, message: "" });
  console.log("🔄 Processing stopped.");
};

const clearProcessingIfDone = () => {
  if (hasStoppedRef.current) return;
  if (processingTimerRef.current || hardStopTimerRef.current) {
    const elapsed = Date.now() - (processingStartTimeRef.current || 0);
    if (elapsed >= MIN_PROCESSING_TIME) {
      stopProcessing();
    }
  }
};

  useEffect(() => {
  return () => {
    if (processingTimerRef.current) clearInterval(processingTimerRef.current);
    if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
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

      startProcessingCycle();

      const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
      // const isShutdown = displayData?.fanSpeed == 3 || displayData?.mode == 0;

      const payload = {
        Header: "0xAA",
        DI: selectedService?.pcb_serial_number || "2411GM-0102",
         MD: displayData.mode,
         FS: displayData.fanSpeed,
        // MD: isShutdown ? "3" : displayData.mode,
        // FS: isShutdown ? "0" : displayData.fanSpeed,
        SRT: displayData.temperature,
        HVAC: newHvacValue,
        Footer: "0xZX",
      };

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
      
      const deviceData = await fetchDataForPCB(pendingService.pcb_serial_number);
      
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
        powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
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
        powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
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
  const getModeDescription = (code) => MODE_MAP[code] || "Fan";

  const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
  const indicatorRotation = pullProgress * 360;
  const indicatorOpacity = pullProgress;

  // ✅ MODIFIED: Loading state checks
  // Show loading if initial data is not loaded yet OR loading is true
  if (loading || !initialDataLoaded) {
    return <Loading onLogout={handleLogout} message="Loading device data..." />;
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

       {/* Blocks touches on background content while pulling/refreshing */}
      {(pullToRefresh.isPulling || pullToRefresh.isRefreshing) && (
        <div className="pull-refresh-blocking-overlay" />
      )}

      {/* Pull-to-refresh popup (floating, doesn't disturb layout) */}
      {(pullToRefresh.isPulling || pullToRefresh.isRefreshing) && (
        <div className="pull-refresh-popup">
          {pullToRefresh.isRefreshing ? (
            <>
              <div className="screen1-refresh-spinner"></div>
              <span>Sending refresh command...</span>
            </>
          ) : (
            <>
              <FiRefreshCw
                size={18}
                style={{
                  transform: `rotate(${indicatorRotation}deg)`,
                  transition: "transform 0.2s ease",
                  opacity: indicatorOpacity,
                }}
              />
              <span>
                {pullToRefresh.pullDistance >= PULL_THRESHOLD ? "Release to refresh" : "Pull down to refresh"}
              </span>
            </>
          )}
        </div>
      )}


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

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="confirm-dialog-overlay">
            <div className="confirm-dialog">
              <div className="confirm-dialog-content">
                <h3>Switch Service?</h3>
                <p>Are you sure you want to switch to <strong>{pendingService?.service_item_name}</strong>?</p>
                {/* <p style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                  PCB: {pendingService?.pcb_serial_number}
                </p> */}
                <div className="confirm-dialog-buttons">
                  <button 
                    className="confirm-dialog-btn confirm-btn-yes"
                    onClick={confirmServiceSwitch}
                  >
                    Yes, Switch
                  </button>
                  <button 
                    className="confirm-dialog-btn confirm-btn-no"
                    onClick={cancelServiceSwitch}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Temperature Change Confirmation Dialog */}
        {showTempConfirmDialog && (
          <div className="confirm-dialog-overlay">
            <div className="confirm-dialog">
              <div className="confirm-dialog-content">
                <h3>Change Temperature?</h3>
                <p>
                  Set temperature to <strong>{pendingTemperature}°C</strong>?
                </p>
                <div className="confirm-dialog-buttons">
                  <button
                    className="confirm-dialog-btn confirm-btn-yes"
                    onClick={confirmTempChange}
                  >
                    Yes, Set
                  </button>
                  <button
                    className="confirm-dialog-btn confirm-btn-no"
                    onClick={cancelTempChange}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay for Service Switching */}
        {switchingService && (
          <div className="service-switching-overlay">
            <div className="service-switching-content">
              <div className="switching-spinner"></div>
              <p className="switching-message">{loadingMessage}</p>
              <div className="switching-progress-bar">
                <div 
                  className="switching-progress-fill"
                  style={{ width: `${switchingProgress}%` }}
                ></div>
              </div>
              {/* <p className="switching-pcb-detail">
                PCB: {pendingService?.pcb_serial_number || 'N/A'}
              </p> */}
            </div>
          </div>
        )}

        {/* Header: Service Dropdown + Power Button Row */}
        <div className="header-controls-row">
          {/* Service Dropdown */}
        <div className="service-dropdown-wrapper">
  <div className="service-dropdown-container">
    <div
      className="service-dropdown-header"
      onClick={() => setShowServiceDropdown(!showServiceDropdown)}
      style={{ position: "relative" }}
    >
      <span>
        {selectedService ? selectedService.service_item_name : "Select Service"}
      </span>

      {/* Global Alarm Badge - shows total count */}
      {dropdownAlarmCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: "0px",
            right: "28px",
            backgroundColor: "red",
            color: "white",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: "bold",
          }}
        >
          {dropdownAlarmCount}
        </span>
      )}

      <FiChevronDown size={18} />
    </div>
    {showServiceDropdown && (
      <div className="service-dropdown-list">
        {serviceItems.map((item) => {
          // Get individual alarm count for this item
          const itemAlarmCount = getAlarmCountForItem(item, allDevicesData);
          
          return (
            <div
              key={item.service_item_id}
              className={`service-dropdown-item ${
                selectedService?.service_item_id === item.service_item_id ? "active" : ""
              }`}
              onClick={() => handleServiceSelect(item)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span>{item.service_item_name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {selectedService?.service_item_id === item.service_item_id && (
                  <span style={{ color: "#3E99ED" }}>✓</span>
                )}
                {itemAlarmCount > 0 && (
                  <span
                    style={{
                      backgroundColor: "red",
                      color: "white",
                      borderRadius: "50%",
                      width: "20px",
                      height: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                      fontWeight: "bold",
                      minWidth: "20px",
                    }}
                  >
                    {itemAlarmCount}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
</div>

          {/* Power Button */}
          <div style={{ position: "relative" }}>
           <button
  className={`screen1-power-button ${processing.status ? "processing" : ""}`}
  onClick={handlePowerToggle}
  disabled={isControlDisabled()}
  style={{
    backgroundColor: !sensorData.isOnline
      ? "#808080"
      : sensorData.powerStatus == "on"
      ? "#5adb5eff"
      : "#c80000f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    height: "48px",
    width: "48px",
    borderRadius: "20px",
    padding: "8px",
    cursor: isControlDisabled() ? "not-allowed" : "pointer",
    fontWeight: "bold",
    opacity: isControlDisabled() ? 0.6 : 1,
  }}
>
  <FiPower size={24} color="#fff" />
  {processing.status && <span className="screen1-processing-indicator"></span>}
</button>
            {sensorData.errorFlag == "1" && <div className="error-indicator" />}
          </div>
        </div>

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
          <div className="screen1-processing-message">{processing.message}</div>
        )}

        {sensorData.errorFlag == "1" && (
          <div className="screen1-error-message">⚠️ System Error Detected - Control Disabled</div>
        )}

        {sensorData.hvacBusy == "1" && !processing.status && (
          <div className="screen1-busy-message">⏳ System is currently busy - Control Disabled</div>
        )}

        {/* Environment Info */}
        <div className="env-info">
          <div className="env-item">
            <FiSun className="env-icon" size={20} color="#FFFFFF" />
            <div className="env-value">
              {sensorData.isOnline ? `${formatTemp(sensorData.outsideTemp)}°C` : "—"}
            </div>
            <div className="env-label">Outside Temp</div>
          </div>
          <div className="env-item">
            <FiThermometer className="env-icon" size={20} color="#FFFFFF" />
            <div className="env-value">
              {sensorData.isOnline ? `${formatTemp(sensorData.roomTemp)}°C` : "—"}
            </div>
            <div className="env-label">Room Temp</div>
          </div>
          <div className="env-item">
            <FiDroplet className="env-icon" size={20} color="#FFFFFF" />
            <div className="env-value">
              {sensorData.isOnline ? `${formatTemp(sensorData.humidity)}%` : "—"}
            </div>
            <div className="env-label">Humidity</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="footer-container">
        {/* Modes Section */}
        <div className="modes-section-in-footer">
          <h3 className="modes-heading">Modes</h3>
          <div className="modes-row">
            {Object.values(MODE_MAP).map((mode) => (
             <button
  key={mode}
  onClick={() => handleModeChange(mode)}
  className={`modes-button ${
    currentModeDescription === mode ? "modes-button-selected" : ""
  }`}
  disabled={isControlDisabled()}
  style={{
    opacity: isControlDisabled() ? 0.6 : 1,
    cursor: isControlDisabled() ? "not-allowed" : "pointer",
  }}
>
  <span
    className={`modes-text ${
      currentModeDescription === mode ? "modes-text-selected" : ""
    }`}
  >
    {mode}
  </span>
</button>
            ))}
          </div>
        </div>

        {/* Fan Speed Section */}
        <div className="fan-speed-section-in-footer">
          <h3 className="fan-speed-heading">Fan Speed</h3>
          <div className="fan-speed-buttons-row">
            {FAN_LABELS.map((label, index) => (
             <button
  key={label}
  onClick={() => handleFanSpeedChange(index)}
  className={`fan-speed-button ${
    fanPosition === index ? "fan-speed-button-selected" : ""
  }`}
  disabled={isControlDisabled()}
  style={{
    opacity: isControlDisabled() ? 0.6 : 1,
    cursor: isControlDisabled() ? "not-allowed" : "pointer",
  }}
>
  <span
    className={`fan-speed-text ${
      fanPosition === index ? "fan-speed-text-selected" : ""
    }`}
  >
    {label}
  </span>
</button>
            ))}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="control-buttons">
            
          <button className="control-btn"  onClick={() => handleNavigation("/chat-bot")}>
                <FiMessageCircle size={20} />
                <span>Chatbot</span> 
              </button> 

          <button
            className="control-btn"
            onClick={() =>
              navigate("/alarms", {
                state: {
                  alarmData: {
                    alarmOccurred: sensorData.alarmOccurred,
                    errorCount: errorCount,
                    deviceId: sensorData.deviceId,
                  },
                  userId: userId,
                  company_id: company_id,
                },
              })
            }
          >
            <div style={{ position: "relative" }}>
              <FiClock size={20} />
              {errorCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-23px",
                    backgroundColor: "red",
                    color: "white",
                    borderRadius: "50%",
                    width: "18px",
                    height: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: "bold",
                  }}
                >
                  {errorCount}
                </span>
              )}
            </div>
            <span>Alarms</span>
          </button>

          <button className="control-btn" onClick={() => handleNavigation("/timers")}>
            <FiWatch size={20} />
            <span>Timers</span>
          </button>

          <button className="control-btn" onClick={() => handleNavigation("/settings")}>
            <FiSettings size={20} />
            <span>Settings</span>
          </button>

          <button className="control-btn" onClick={() => handleNavigation("/machine")}>
            <FiZap size={20} />
            <span>Services</span>
          </button>

          <button className="control-btn" onClick={handleLogout}>
            <FiLogOut size={20} />
            <span>Logout</span>
          </button>
        </div>

        <div className="footer-logo">
          <img src={greenAire} alt="GreenAire Logo" className="logo-image" style={{ marginTop: "-12px" }} />
        </div>
      </div>
    </div>
  );
};

export default Screen1;