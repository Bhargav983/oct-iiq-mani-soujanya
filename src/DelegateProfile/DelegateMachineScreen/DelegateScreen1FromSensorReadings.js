// // DelegateScreen1.js (Complete with Pull-to-Refresh)
// import React, { useState, useEffect, useContext, useRef } from "react";
// import axios from "axios";
// import {
//   FiArrowLeft,
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
//   FiNavigation,
//   FiLayers,
//   FiRefreshCw,
//   FiCornerUpRight,
//   FiChevronDown,
// } from "react-icons/fi";
// import { FaFan } from "react-icons/fa";
// // import "./Screen1.css";
// import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
// import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
// import { useNavigate } from "react-router-dom"; 
// import { AuthContext } from "../../Components/AuthContext/AuthContext";
// import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";
// import baseURL from "../../Components/ApiUrl/Apiurl";
// import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
// import './DelegateMachineScreens.css'

// // Mode mapping constant
// const MODE_MAP = {
//   1: "IDEC",
//   2: "Auto",
//   3: "Fan",
//   4: "Indirect",
//   5: "Direct",
// };

// // Pull-to-refresh configuration
// const PULL_THRESHOLD = 80; // Minimum pull distance to trigger refresh
// const MAX_PULL = 120; // Maximum pull distance

// const PROCESSING_MESSAGES = [
//   "Sending command...",
//   "Almost done, please wait...",
//   "Waiting for device response...",
// ];

// // Helper functions
// const formatTemp = (temp) => {
//   if (temp == null) return "0.0";
//   const num = parseFloat(temp);
//   return isNaN(num) ? "0.0" : num.toFixed(1);
// };

// // Function to send HVAC=3 command
// const sendRefreshCommand = async (pcbSerialNumber, sensorData) => {
//   const payload = {
//     Header: "0xAA",
//     DI: pcbSerialNumber || "2411GM-0102",
//     MD: sensorData.mode || "3",
//     FS: sensorData.fanSpeed || "0",
//     SRT: sensorData.temperature || 25,
//     HVAC: "3", // Always send 3 on refresh
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

//     // 👇 IMPORTANT: parse response even on 400
//     try {
//       responseBody = await response.json();
//     } catch {
//       responseBody = await response.text();
//     }

//     // ❌ Backend rejected command (device offline, etc.)
//     if (!response.ok) {
//       console.group("❌ BACKEND REJECTED COMMAND");
//       console.error("Status:", response.status);
//       console.error("Response:", responseBody);
//       console.groupEnd();

//       return {
//         success: false,
//         error:
//           responseBody?.error ||
//           responseBody?.message ||
//           "Command rejected by server",
//         status: response.status,
//       };
//     }

//     // ✅ Success
//     console.group("✅ REFRESH SUCCESS");
//     console.log("Response:", responseBody);
//     console.groupEnd();

//     return { success: true, data: responseBody };
//   } catch (error) {
//     console.group("🚨 NETWORK ERROR");
//     console.error(error);
//     console.groupEnd();

//     return {
//       success: false,
//       error: "Network error or server unreachable",
//     };
//   }
// };

// const DelegateScreen1 = () => {




//   const { user, logout } = useContext(AuthContext);
//   const { 
//     selectedServiceItem,
//     getSelectedServiceDetails,
//     serviceItemPermissions,
//     serviceItems, // Get all service items from context
//     updateSelectedServiceItem, // Function to change selected service item
//     loading: serviceItemsLoading 
//   } = useDelegateServiceItems();
  
//   const userId = user?.delegate_id;
//   const company_id = user?.company_id;
//   const navigate = useNavigate();

//   const processingTimerRef = useRef(null);
// const processingMsgIndexRef = useRef(0);
// const hardStopTimerRef = useRef(null);

//    const fetchIntervalRef = useRef(null);

//   // Pull-to-refresh state
//   const [pullToRefresh, setPullToRefresh] = useState({
//     isPulling: false,
//     pullDistance: 0,
//     isRefreshing: false,
//   });
  
//   // Touch start position
//   const touchStartY = useRef(0);
//   const containerRef = useRef(null);
  
//   // State management
//   const [selectedService, setSelectedService] = useState(null);
//   const [processing, setProcessing] = useState({ status: false, message: "" });
//   const [errorCount, setErrorCount] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [serviceItemsList, setServiceItemsList] = useState([]); // Store service items with names
//   const [manualRefresh, setManualRefresh] = useState(false);
//   const [refreshStatus, setRefreshStatus] = useState({ 
//     sending: false, 
//     success: false, 
//     message: "" 
//   });

//   const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  
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
//      isOnline: true, // ✅ ADD THIS
//   });

//   // Check if selected service has PCB serial number - ONLY for restricting modes
//   const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;

//   // Fetch service items with names from API
//   useEffect(() => {
//     if (user?.company_id && user?.delegate_id) {
//       axios.get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
//         .then((response) => {
//           try {
//             const data = Array.isArray(response.data) ? response.data : 
//                         (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
//             setServiceItemsList(data);
//           } catch (error) {
//             console.error('Error processing service items data:', error);
//             setServiceItemsList([]);
//           }
//         })
//         .catch((error) => {
//           console.error('Error fetching service items:', error);
//           setServiceItemsList([]);
//         });
//     }
//   }, [user?.company_id, user?.delegate_id]);

//   // Get the complete service details when selectedServiceItem changes
//   useEffect(() => {
//     if (!serviceItemsLoading && selectedServiceItem) {
//       const serviceDetails = getSelectedServiceDetails();
//       console.log("Selected Service Details:", serviceDetails);
//       setSelectedService(serviceDetails);
//     }
//   }, [selectedServiceItem, serviceItemsLoading, getSelectedServiceDetails]);

//   // Fetch sensor data when selectedService changes
// useEffect(() => {
//   if (!selectedService?.pcb_serial_number) {
//     console.log("⏳ Waiting for PCB serial number...", selectedService);
//     setLoading(false);
//     return;
//   }

//   const pcbSerialNumber = selectedService.pcb_serial_number;
//   console.log("🟢 Selected PCB:", pcbSerialNumber);

//   const fetchData = async () => {
//     try {
//       console.log("📡 Fetching data for PCB:", pcbSerialNumber);

//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) {
//         console.error("❌ API Response Error:", {
//           status: response.status,
//           statusText: response.statusText,
//         });
//         throw new Error("Network response was not ok");
//       }

//       const data = await response.json();
//       console.log("✅ API Response:", data);

//       if (data?.status !== "success" || !data?.data) {
//         console.warn("⚠️ Invalid API data format:", data);
//         return;
//       }

//       const deviceData = data.data;

//       setSensorData({
//         outsideTemp: deviceData?.outdoor_temperature?.value,
//         humidity: deviceData?.room_humidity?.value,
//         roomTemp: deviceData?.room_temperature?.value,
//         fanSpeed: deviceData?.fan_speed?.value,
//         temperature: deviceData?.set_temperature?.value,
//         powerStatus:
//           deviceData?.hvac_on?.value === "1" ? "on" : "off",
//         mode: deviceData?.mode?.value,
//         errorFlag: deviceData?.error_flag?.value,
//         hvacBusy: deviceData?.hvac_busy?.value,
//         deviceId: pcbSerialNumber,
//         alarmOccurred: deviceData?.alarm_occurred?.value,
//          isOnline: deviceData.is_online, // ✅ ADD THIS
//       });

//       const alarmValue = deviceData?.alarm_occurred?.value;
//       setErrorCount(
//         alarmValue && alarmValue !== "0"
//           ? Number(alarmValue)
//           : 0
//       );

      

//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);

//       // Early exit from processing if hvac responded
// if (deviceData.hvac_busy?.value == "0") {
//   clearProcessingIfDone();
// }

//     } catch (error) {
//       console.error("🔥 Fetch Error:", error);

//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);
//     }
//   };

//   /* ===============================
//      🔥 CLEAR OLD INTERVAL FIRST
//   ================================ */
//   if (fetchIntervalRef.current) {
//     clearInterval(fetchIntervalRef.current);
//     fetchIntervalRef.current = null;
//     console.log("🧹 Old interval cleared");
//   }

//   // ⏱️ Run immediately
//   fetchData();
// fetchAllAlarms(); // ✅ NEW
//   // ⏱️ Start polling
//   fetchIntervalRef.current = setInterval(() => {
//   fetchData();
//   fetchAllAlarms(); // ✅ NEW
// }, 1000);

//   // 🧹 Cleanup
//   return () => {
//     if (fetchIntervalRef.current) {
//       clearInterval(fetchIntervalRef.current);
//       fetchIntervalRef.current = null;
//       console.log("🛑 Interval cleaned up");
//     }
//   };

// }, [selectedService?.pcb_serial_number, userId, company_id]);


// const fetchAllAlarms = async () => {
//   try {
//     const response = await fetch(
//       `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
//     );

//     if (!response.ok) throw new Error("Failed to fetch alarms");

//     const data = await response.json();

//     if (data.status !== "success" || !data.data) return;

//     const alarmCount = data.data.reduce((count, item) => {
//       const val = item.alarm_occurred?.value;

//       if (val && val !== "0") {
//         return count + Number(val);
//       }
//       return count;
//     }, 0);

//     setDropdownAlarmCount(alarmCount);
//   } catch (err) {
//     console.error("Alarm fetch error:", err);
//   }
// };

//   // Pull-to-refresh handlers
//   const handleTouchStart = (e) => {
//     const touch = e.touches[0];
//     touchStartY.current = touch.clientY;
//   };

//   const handleTouchMove = (e) => {
//     // Only trigger pull-to-refresh if at the top of the container
//     if (containerRef.current && containerRef.current.scrollTop > 0) {
//       return;
//     }

//     const touch = e.touches[0];
//     const pullDistance = touch.clientY - touchStartY.current;

//     // Only trigger for downward pull
//     if (pullDistance > 0) {
//       e.preventDefault();
      
//       const limitedPull = Math.min(pullDistance, MAX_PULL);
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: limitedPull,
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleTouchEnd = async () => {
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       // Trigger refresh
//       setPullToRefresh({
//         isPulling: false,
//         pullDistance: 0,
//         isRefreshing: true,
//       });
      
//       // Send HVAC=3 command to controller
//       await sendRefreshToController();
      
//       // Trigger data refresh after sending command
//       setManualRefresh(true);
//     } else {
//       // Reset pull state
//       setPullToRefresh({
//         isPulling: false,
//         pullDistance: 0,
//         isRefreshing: false,
//       });
//     }
//   };

//   // Mouse events for desktop testing
//   const handleMouseDown = (e) => {
//     touchStartY.current = e.clientY;
//     document.addEventListener('mousemove', handleMouseMove);
//     document.addEventListener('mouseup', handleMouseUp);
//   };

//   const handleMouseMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) {
//       return;
//     }

//     const pullDistance = e.clientY - touchStartY.current;
    
//     if (pullDistance > 0) {
//       e.preventDefault();
      
//       const limitedPull = Math.min(pullDistance, MAX_PULL);
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: limitedPull,
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleMouseUp = async () => {
//     document.removeEventListener('mousemove', handleMouseMove);
//     document.removeEventListener('mouseup', handleMouseUp);
    
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({
//         isPulling: false,
//         pullDistance: 0,
//         isRefreshing: true,
//       });
      
//       // Send HVAC=3 command to controller
//       await sendRefreshToController();
      
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({
//         isPulling: false,
//         pullDistance: 0,
//         isRefreshing: false,
//       });
//     }
//   };

//   // Function to send refresh command with HVAC=3
// const sendRefreshToController = async () => {
//   if (!selectedService || !selectedService.pcb_serial_number) {
//     console.warn("No PCB serial number available for refresh command");

//     setRefreshStatus({
//       sending: false,
//       success: false,
//       message: "No device selected",
//     });

//     return { success: false, message: "No device selected" };
//   }

//   if (!serviceItemPermissions?.can_control_equipment) {
//     console.warn("No control permissions for refresh command");

//     setRefreshStatus({
//       sending: false,
//       success: false,
//       message: "Control permissions not available",
//     });

//     return { success: false, message: "Control permissions not available" };
//   }

//   // setRefreshStatus({
//   //   sending: true,
//   //   success: false,
//   //   message: "Sending refresh command...",
//   // });

//   try {
//     const result = await sendRefreshCommand(
//       selectedService.pcb_serial_number,
//       sensorData
//     );

//     if (result?.success) {
//       setRefreshStatus({
//         sending: false,
//         success: true,
//         message: "Refresh command sent successfully",
//       });

//       // Clear success message after 3 seconds
//       setTimeout(() => {
//         setRefreshStatus({ sending: false, success: false, message: "" });
//       }, 3000);

//       return result;
//     }

//     /* ===============================
//        HANDLE BACKEND ERROR MESSAGE
//     ================================ */

//     const backendMessage =
//       result?.error ||
//       result?.message ||
//       "Failed to send refresh command";

//     console.error("❌ Refresh Command Failed:", backendMessage);

//     setRefreshStatus({
//       sending: false,
//       success: false,
//       message: backendMessage, // 👈 REAL BACKEND MESSAGE
//     });

//     // Clear error after 3 seconds
//     setTimeout(() => {
//       setRefreshStatus({ sending: false, success: false, message: "" });
//     }, 3000);

//     return result;

//   } catch (error) {
//     console.error("🔥 Refresh Command Exception:", error);

//     const errorMessage =
//       error?.message || "Unexpected error occurred";

//     setRefreshStatus({
//       sending: false,
//       success: false,
//       message: errorMessage,
//     });

//     // Clear error after 3 seconds
//     setTimeout(() => {
//       setRefreshStatus({ sending: false, success: false, message: "" });
//     }, 3000);

//     return { success: false, error: errorMessage };
//   }
// };


//   // Event handlers
//   const handleLogout = () => {
//     logout();
//     navigate("/");
//   };

//   const handleServiceItemChange = (e) => {
//     const selectedId = e.target.value;
//     updateSelectedServiceItem(selectedId);
//     // Reset loading states when changing service items
//     setLoading(true);
//     setSelectedService(null);
//     // Reset pull-to-refresh state
//     setPullToRefresh({
//       isPulling: false,
//       pullDistance: 0,
//       isRefreshing: false,
//     });
//   };

//   const startProcessingCycle = () => {
//   processingMsgIndexRef.current = 0;
//   setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

//   processingTimerRef.current = setInterval(() => {
//     processingMsgIndexRef.current += 1;
//     const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
//     if (nextMsg) {
//       setProcessing({ status: true, message: nextMsg });
//     }
//   }, 10000);

//   // Hard fallback stop after 25s
//   hardStopTimerRef.current = setTimeout(() => {
//     stopProcessing();
//   }, 25000);
// };

// const stopProcessing = () => {
//   if (processingTimerRef.current) {
//     clearInterval(processingTimerRef.current);
//     processingTimerRef.current = null;
//   }
//   if (hardStopTimerRef.current) {
//     clearTimeout(hardStopTimerRef.current);
//     hardStopTimerRef.current = null;
//   }
//   setProcessing({ status: false, message: "" });
// };

// useEffect(() => {
//   return () => {
//     if (processingTimerRef.current) clearInterval(processingTimerRef.current);
//     if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
//   };
// }, []);


//  const handlePowerToggle = async () => {
//   if (!selectedService?.pcb_serial_number) {
//     console.error("No PCB serial number available");
//     return;
//   }

//   if (processing.status || sensorData.hvacBusy == "1") {
//     const msg =
//       sensorData.hvacBusy == "1"
//         ? "System is busy, please wait..."
//         : "Please wait...";
//     setProcessing({ status: true, message: msg });
//     return;
//   }

//   // ✅ Start progressive message cycling
//   startProcessingCycle();

//   const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
//   const isShutdown = sensorData?.fanSpeed === 3 || sensorData?.mode === 0;

//   const payload = {
//     Header: "0xAA",
//     DI: selectedService.pcb_serial_number,
//     MD: isShutdown ? "3" : sensorData.mode,
//     FS: isShutdown ? "0" : sensorData.fanSpeed,
//     SRT: sensorData.temperature,
//     HVAC: newHvacValue,
//     Footer: "0xZX",
//   };

//   console.log("Sending payload:", payload);

//   try {
//     const response = await fetch("https://mdata.air2o.net/controllers/", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload),
//     });

//     if (!response.ok) {
//       console.error("❌ API error:", response.status);
//       stopProcessing();
//       throw new Error("Failed to send command");
//     }

//     const result = await response.text();
//     console.log("✅ Command sent:", result);
//     // Don't stop here — polling will detect hvac_busy=0 and stop automatically
//   } catch (error) {
//     console.error("Error sending command:", error);
//     stopProcessing();
//   }
// };

// const clearProcessingIfDone = () => {
//   if (processingTimerRef.current || hardStopTimerRef.current) {
//     stopProcessing();
//   }
// };

//   // Get service item name for display
//   const getServiceItemName = (serviceItemId) => {
//     if (!serviceItemId) return 'Select Service Item';
    
//     const itemFromApi = serviceItemsList.find(item => item.service_item_id === serviceItemId);
//     if (itemFromApi) {
//       return itemFromApi.service_item_name || serviceItemId;
//     }
    
//     const itemFromContext = serviceItems.find(item => item.service_item === serviceItemId);
//     return itemFromContext ? itemFromContext.service_item_name || serviceItemId : serviceItemId;
//   };

//   // Manual refresh function - sends HVAC=3 command
//   const handleManualRefresh = async () => {
//     if (!pullToRefresh.isRefreshing && !processing.status && !refreshStatus.sending) {
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: true }));
      
//       // Send HVAC=3 command to controller
//       await sendRefreshToController();
      
//       // Refresh the data
//       setManualRefresh(true);
//     }
//   };

//   const handleNavigation = (path) => {
//     if (!processing.status) {
//       navigate(path);
//     }
//   };

//   const handleTempChange = (newTemp) => {
//     console.log("Temperature changed:", newTemp);
//   };

//   // Calculate pull indicator rotation and opacity
//   const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
//   const indicatorRotation = pullProgress * 360;
//   const indicatorOpacity = pullProgress;

//   // No service items case
//   if (!serviceItemsLoading && serviceItems.length === 0) {
//     return (
//       <div className="mainmain-container" style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         minHeight: "100vh",
//         display: "flex",
//         flexDirection: "column",
//         justifyContent: "center",
//         alignItems: "center",
//         padding: "20px",
//         textAlign: "center"
//       }}>
//         <div className="logo">
//           <img
//             src={AIROlogo}
//             alt="AIRO Logo"
//             className="logo-image delegate-logo"
//             style={{ marginBottom: "20px" }}
//           />
//         </div>
        
//         <div style={{
//           backgroundColor: "rgba(255, 255, 255, 0.1)",
//           padding: "40px",
//           borderRadius: "12px",
//           maxWidth: "500px",
//           width: "100%"
//         }}>
//           <h2 style={{ color: "white", marginBottom: "20px", fontSize: "24px" }}>
//             No Machines Assigned
//           </h2>
//           <p style={{ color: "white", marginBottom: "30px", fontSize: "16px", lineHeight: "1.5" }}>
//             You don't have any machines assigned to your account yet. 
//             Please wait until a machine is assigned to you, or contact your administrator.
//           </p>
          
//           <div style={{ display: "flex", gap: "15px", justifyContent: "center", flexWrap: "wrap" }}>
//             <button
//               onClick={handleLogout}
//               style={{
//                 padding: "12px 24px",
//                 backgroundColor: "rgba(255, 255, 255, 0.2)",
//                 color: "white",
//                 border: "1px solid rgba(255, 255, 255, 0.3)",
//                 borderRadius: "6px",
//                 cursor: "pointer",
//                 fontSize: "16px",
//                 display: "flex",
//                 alignItems: "center",
//                 gap: "8px"
//               }}
//             >
//               <FiLogOut size={18} />
//               Logout
//             </button>
//           </div>
//            <div style={{ marginTop: "10%", display: "flex", gap: "15px", justifyContent: "center", flexWrap: "wrap" }}>
//             <button
//               onClick={() => navigate("/delegate-home")}
//               style={{
//                 padding: "12px 24px",
//                 backgroundColor: "rgba(255, 255, 255, 0.2)",
//                 color: "white",
//                 border: "1px solid rgba(255, 255, 255, 0.3)",
//                 borderRadius: "6px",
//                 cursor: "pointer",
//                 fontSize: "16px",
//                 display: "flex",
//                 alignItems: "center",
//                 gap: "8px"
//               }}
//             >
//               <FiLogOut size={18} />
//               Go to Home
//             </button>
//           </div>
//         </div>
        
//         <div className="footer-logo" style={{ marginTop: "40px" }}>
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     );
//   }

//   // Loading state
//   if (serviceItemsLoading) {
//     return (
//       <div
//         className="mainmain-container"
//         style={{
//           backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//           minHeight: "100vh",
//           display: "flex",
//           justifyContent: "center",
//           alignItems: "center",
//           flexDirection: "column",
//           color: "white",
//         }}
//       >
//         <div
//           className="loading"
//           style={{ color: "white", fontSize: "18px", marginBottom: "20px", gap: "10%" }}
//         >
//           Loading...
          
//         <button
//           onClick={handleLogout}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "8px",
//             backgroundColor: "rgba(255, 255, 255, 0.15)",
//             color: "white",
//             border: "1px solid white",
//             borderRadius: "8px",
//             padding: "8px 16px",
//             cursor: "pointer",
//             fontSize: "16px",
//             transition: "0.3s",
//           }}
//           onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)")}
//           onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)")}
//         >
//           <FiLogOut size={20} />
//           <span>Logout</span>
//         </button>
//         </div>
//       </div>
//     );
//   }

//   // Handle case where no service item is selected but service items exist
//   if (!selectedServiceItem && serviceItems.length > 0) {
//     return (
//       <div className="mainmain-container" style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)"
//       }}>
//         <div className="main-container">
//           <div className="error-message">
//             Please select a service item to continue.
//           </div>
//           <button 
//             className="control-btn" 
//             onClick={() => navigate("/delegate-home")}
//             style={{ marginTop: '20px' }}
//           >
//             Go Back to Services
//           </button>
//         </div>
//       </div>
//     );
//   }

//   // Derived values
//   const fanPosition = ["0", "1", "2"].indexOf(sensorData.fanSpeed);
//   const getModeDescription = (code) => MODE_MAP[code] || "Fan";

//   return (
//     <div 
//       className="mainmain-container" 
//       style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         touchAction: "pan-y",
//       }}
//       ref={containerRef}
//       onTouchStart={handleTouchStart}
//       onTouchMove={handleTouchMove}
//       onTouchEnd={handleTouchEnd}
//       onMouseDown={handleMouseDown}
//     >
//       {/* Pull-to-refresh indicator */}
//       <div 
//         className="screen1-pull-refresh"
//         style={{
//           height: `${pullToRefresh.pullDistance}px`,
//           opacity: pullToRefresh.isPulling || pullToRefresh.isRefreshing ? 1 : 0,
//           transform: `translateY(${pullToRefresh.isPulling ? 0 : -30}px)`,
//           transition: pullToRefresh.isPulling ? 'none' : 'all 0.3s ease',
//         }}
//       >
//         <div className="screen1-refresh-content">
//           {pullToRefresh.isRefreshing ? (
//             <>
//               <div className="screen1-refresh-spinner"></div>
//               <span>Sending refresh command...</span>
//             </>
//           ) : (
//             <>
//               <FiRefreshCw 
//                 size={24} 
//                 style={{
//                   transform: `rotate(${indicatorRotation}deg)`,
//                   transition: 'transform 0.2s ease',
//                   opacity: indicatorOpacity,
//                 }}
//               />
//               <span>
//                 {pullToRefresh.pullDistance >= PULL_THRESHOLD 
//                   ? "Release to refresh" 
//                   : "Pull down to refresh"}
//               </span>
//             </>
//           )}
//         </div>
//       </div>

//       <div className="main-container">
//         {/* Manual refresh button */}
//         {/* <div className="screen1-refresh-button-container">
//           <button 
//             className="screen1-refresh-button"
//             onClick={handleManualRefresh}
//             disabled={pullToRefresh.isRefreshing || processing.status || refreshStatus.sending || !serviceItemPermissions.can_control_equipment}
//             title="Refresh data and send command"
//           >
//             <FiRefreshCw 
//               size={18} 
//               className={pullToRefresh.isRefreshing ? "screen1-refresh-spinning" : ""}
//             />
//           </button>
//         </div> */}

//         {/* Refresh command status */}
//         {refreshStatus.message && (
//           <div className={`screen1-refresh-status ${refreshStatus.success ? 'success' : 'error'}`}>
//             {refreshStatus.message}
//           </div>
//         )}

//         {/* Service Display - Now with Dropdown when multiple items exist */}
//         <div className="service-display-container delegate-service-display">
//           {serviceItems.length > 1 ? (
//             // Show dropdown when user has multiple service items
//             <div className="service-dropdown-container  del-service-dropdown-container"  >
//               <label htmlFor="service-item-select" className="service-dropdown-label">
//                 Select Service Item:
//               </label>
//               <select
//                 id="service-item-select"
//                 className="service-dropdown-select del-service-dropdown-select"
//                 value={selectedServiceItem}
//                 onChange={handleServiceItemChange}
//               >
//                 {serviceItems.map((item) => {
//                   const displayName = getServiceItemName(item.service_item);
//                   return (
//                     <option key={item.service_item} value={item.service_item}>
//                       {displayName}
//                     </option>
//                   );
//                 })}
//               </select>
//                 {/* 🔴 GLOBAL ALARM BADGE */}
//   {dropdownAlarmCount > 0 && (
//     <span
//       style={{
//         position: "absolute",
//         top: "-6px",
//         right: "-6px",
//         backgroundColor: "red",
//         color: "white",
//         borderRadius: "50%",
//         width: "18px",
//         height: "18px",
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "center",
//         fontSize: "10px",
//         fontWeight: "bold",
//       }}
//     >
//       {dropdownAlarmCount}
//     </span>
//   )}
//             </div>
//           ) : (
//             // Show simple display when user has only one service item
//             <div className="service-display-header">
//               <span>
//                 {selectedService?.service_item_name || "Loading..."}
//               </span>
//               <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
//                 PCB: {selectedService?.pcb_serial_number || 'Loading...'}
//               </div>
//               {serviceItemPermissions.can_control_equipment && (
//                 <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '2px' }}>
//                   • Control Enabled
//                 </div>
//               )}
//             </div>
//           )}
//         </div>

//         {/* PCB Warning Message */}
//         {selectedService && !hasValidPCBSerial && (
//           <h6 style={{ color: "black", marginTop: "10px", textAlign: "center" }}>
//             No PCB serial number captured.
//           </h6>
//         )}

//         {/* Header */}
//         <div className="header1 delegate-header">
//           <div className="logo">
//             <img
//               src={AIROlogo}
//               alt="AIRO Logo"
//               className="logo-image delegate-logo"
//               style={{ marginBottom: "-68px" }}
//             />
//           </div>

//           <div style={{ position: "relative" }}>
//             <button
//               className={`screen1-power-button screen1-power-button2 del-screen1-power-button ${processing.status ? "processing" : ""}`}
//               onClick={handlePowerToggle}
//               disabled={processing.status || !sensorData.isOnline || !selectedService?.pcb_serial_number || !serviceItemPermissions.can_control_equipment}
//               style={{
//                backgroundColor:
//   !sensorData.isOnline
//     ? "#808080" // grey when offline
//     : sensorData.powerStatus == "on"
//     ? "#5adb5eff"
//     : "#c80000f5",
//                 display: "flex",
//                 alignItems: "center",
//                 justifyContent: "center",
//                 border: "none",
//                 height: "48px",
//                 width: "48px",
//                 borderRadius: "4px",
//                 padding: "8px",
//                 cursor: (processing.status || !sensorData.isOnline || !serviceItemPermissions.can_control_equipment) ? "not-allowed" : "pointer",
//                 fontWeight: "bold",
//                 opacity: (processing.status || !sensorData.isOnline || !serviceItemPermissions.can_control_equipment) ? 0.6 : 1,
//               }}
//             >
//               <FiPower size={24} color="#fff" />
//               {processing.status && <span className="screen1-processing-indicator"></span>}
//             </button>

//             {sensorData.errorFlag == "1" && (
//               <div className="error-indicator" />
//             )}
//           </div>
//         </div>

// <div style={{ position: "relative", marginTop: "30px" }}>
//  {/* ✅ FIX 2: Offline banner positioned BETWEEN header and temperature dial */}
//         {!sensorData.isOnline && (
//           <div
//             style={{
//               backgroundColor: "rgba(0,0,0,0.55)",
//               color: "#fff",
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
//         </div>
//         {/* Status Messages */}
//         {processing.status && (
//           <div className="screen1-processing-message  del-screen1-processing-message">{processing.message}</div>
//         )}

//         {sensorData.errorFlag == "1" && (
//           <div className="screen1-error-message del-screen1-error-message">
//             ⚠️ System Error Detected
//           </div>
//         )}

//         {sensorData.hvacBusy == "1" && !processing.status && (
//           <div className="screen1-busy-message del-screen1-busy-message">
//             ⏳ System is currently busy
//           </div>
//         )}

//         {!serviceItemPermissions.can_control_equipment && (
//           <div className="warning-message  del-warning-message">
//             ⚠️ Control permissions not available
//           </div>
//         )}

//         {/* Temperature Dial */}
//        <div style={{ pointerEvents: 'none', opacity: sensorData.isOnline ? 1 : 0.35 }}>
//         <TemperatureDial
//           sensorData={sensorData}
//           onTempChange={handleTempChange}
//           fanSpeed={fanPosition}
//           initialTemperature={sensorData.temperature ?? 25}
//         />
//         </div>

//         {/* Environment Info */}
//         <div className="env-info del-env-info">
//           <div className="env-item">
//             <FiSun className="env-icon" size={20} color="#FFFFFF" />
//             <div className="env-value">{sensorData.isOnline ? `${formatTemp(sensorData.outsideTemp)}°C` : "—"}</div>
//             <div className="env-label">Outside Temp</div>
//           </div>
//           <div className="env-item">
//             <FiThermometer className="env-icon" size={20} color="#FFFFFF" />
//             <div className="env-value">{sensorData.isOnline ? `${formatTemp(sensorData.roomTemp)}°C` : "—"}</div>
//             <div className="env-label">Room Temp</div>
//           </div>
//           <div className="env-item">
//             <FiDroplet className="env-icon" size={20} color="#FFFFFF" />
//             <div className="env-value">{sensorData.isOnline ? `${formatTemp(sensorData.humidity)}%` : "—"}</div>
//             <div className="env-label">Humidity</div>
//           </div>
//         </div>
//       </div>

//       {/* Footer */}
//       <div className="footer-container">
//         <div className="control-buttons">
//           <button
//             className={`control-btn ${!hasValidPCBSerial ? 'screen1-disabled-btn' : ''}`}
//             onClick={() => {
//               if (hasValidPCBSerial) {
//                 navigate("/delegate-machinescreen2", { 
//                   state: { sensorData, selectedService, userId, company_id}
//                 });
//               }
//             }}
//             disabled={!hasValidPCBSerial || !serviceItemPermissions.can_control_equipment}
//             title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
//           >
//             <FiWind size={20} />
//             <span>Modes</span>
//             <span><strong>{getModeDescription(sensorData.mode)}</strong></span>
//           </button>
          
//           <button
//             className="control-btn"
//             onClick={() => navigate("/Delegate-alarms", {
//               state: {
//                 alarmData: {
//                   alarmOccurred: sensorData.alarmOccurred,
//                   errorCount: errorCount,
//                   deviceId: sensorData.deviceId,
//                 },
//                 userId: userId,
//                 company_id: company_id
//               },
//             })}
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
          
//           <button
//             className="control-btn"
//             onClick={() => handleNavigation("/timers")}
//             disabled={!serviceItemPermissions.can_control_equipment}
//           >
//             <FiWatch size={20} />
//             <span>Timers</span>
//           </button>
          
//           <button
//             className="control-btn"
//             onClick={() => handleNavigation("/settings")}
//           >
//             <FiSettings size={20} />
//             <span>Settings</span>
//           </button>
          
//           <button
//             className="control-btn"
//             onClick={() => handleNavigation("/delegate-home")}
//           >
//             <FiZap size={20} />
//             <span>Services</span>
//           </button>
          
//           <button
//             className="control-btn"
//             onClick={handleLogout}
//           >
//             <FiLogOut size={20} />
//             <span>Logout</span>
//           </button>
//         </div>
        
//         <div className="footer-logo">
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default DelegateScreen1; 



// // DelegateScreen1.js — Complete with all functionalities (Modes + Fan Speed in footer)
// import React, { useState, useEffect, useContext, useRef } from "react";
// import axios from "axios";
// import {
//   FiArrowLeft,
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
// import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
// import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
// import { useNavigate } from "react-router-dom"; 
// import { AuthContext } from "../../Components/AuthContext/AuthContext";
// import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";
// import baseURL from "../../Components/ApiUrl/Apiurl";
// import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
// import './DelegateMachineScreens.css'

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

// const FAN_SPEEDS = ["0", "1", "2"]; // 0=High, 1=Medium, 2=Low
// const FAN_LABELS = ["High", "Medium", "Low"];

// // Pull-to-refresh configuration
// const PULL_THRESHOLD = 80;
// const MAX_PULL = 120;

// // Progressive messages every 10s
// const PROCESSING_MESSAGES = [
//   "Sending command...",
//   "Almost done, please wait...",
//   "Waiting for device response...",
// ];

// // Helper functions
// const formatTemp = (temp) => {
//   if (temp == null) return "0.0";
//   const num = parseFloat(temp);
//   return isNaN(num) ? "0.0" : num.toFixed(1);
// };

// // Function to send HVAC=3 command
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

// const DelegateScreen1 = () => {
//   const { user, logout } = useContext(AuthContext);
//   const { 
//     selectedServiceItem,
//     getSelectedServiceDetails,
//     serviceItemPermissions,
//     serviceItems,
//     updateSelectedServiceItem,
//     loading: serviceItemsLoading 
//   } = useDelegateServiceItems();
  
//   const userId = user?.delegate_id;
//   const company_id = user?.company_id;
//   const navigate = useNavigate();

//   // Refs
//   const activePCBRef = useRef(null);
//   const fetchIntervalRef = useRef(null);
//   const processingTimerRef = useRef(null);
//   const processingMsgIndexRef = useRef(0);
//   const hardStopTimerRef = useRef(null);
//   const processingStartTimeRef = useRef(null);
//   const touchStartY = useRef(0);
//   const containerRef = useRef(null);

//   // Pull-to-refresh state
//   const [pullToRefresh, setPullToRefresh] = useState({
//     isPulling: false,
//     pullDistance: 0,
//     isRefreshing: false,
//   });
  
//   // State management
//   const [selectedService, setSelectedService] = useState(null);
//   const [showServiceDropdown, setShowServiceDropdown] = useState(false);
//   const [processing, setProcessing] = useState({ status: false, message: "" });
//   const [errorCount, setErrorCount] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [serviceItemsList, setServiceItemsList] = useState([]);
//   const [manualRefresh, setManualRefresh] = useState(false);
//   const [refreshStatus, setRefreshStatus] = useState({ 
//     sending: false, 
//     success: false, 
//     message: "" 
//   });
//   const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  
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

//   // Display data for local changes
//   const [displayData, setDisplayData] = useState({
//     fanSpeed: "0",
//     temperature: 25,
//     mode: "3",
//     powerStatus: "off",
//   });

//   // Sync displayData with sensorData
//   useEffect(() => {
//     setDisplayData({
//       fanSpeed: sensorData.fanSpeed,
//       temperature: sensorData.temperature,
//       mode: sensorData.mode,
//       powerStatus: sensorData.powerStatus,
//     });
//   }, [sensorData]);

//   // Check if selected service has PCB serial number
//   const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;
  
//   // Get current mode description
//   const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
  
//   // Get fan position
//   const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

//   // Fetch service items with names from API
//   useEffect(() => {
//     if (user?.company_id && user?.delegate_id) {
//       axios.get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
//         .then((response) => {
//           try {
//             const data = Array.isArray(response.data) ? response.data : 
//                         (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
//             setServiceItemsList(data);
//           } catch (error) {
//             console.error('Error processing service items data:', error);
//             setServiceItemsList([]);
//           }
//         })
//         .catch((error) => {
//           console.error('Error fetching service items:', error);
//           setServiceItemsList([]);
//         });
//     }
//   }, [user?.company_id, user?.delegate_id]);

//   // Get the complete service details when selectedServiceItem changes
//   useEffect(() => {
//     if (!serviceItemsLoading && selectedServiceItem) {
//       const serviceDetails = getSelectedServiceDetails();
//       console.log("Selected Service Details:", serviceDetails);
//       setSelectedService(serviceDetails);
//       if (serviceDetails?.pcb_serial_number) {
//         activePCBRef.current = serviceDetails.pcb_serial_number;
//       }
//     }
//   }, [selectedServiceItem, serviceItemsLoading, getSelectedServiceDetails]);

//   // Fetch all alarms for dropdown badge
//   const fetchAllAlarms = async () => {
//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Failed to fetch alarms");

//       const data = await response.json();

//       if (data.status !== "success" || !data.data) return;

//       const alarmCount = data.data.reduce((count, item) => {
//         const val = item.alarm_occurred?.value;
//         if (val && val !== "0") {
//           return count + Number(val);
//         }
//         return count;
//       }, 0);

//       setDropdownAlarmCount(alarmCount);
//     } catch (err) {
//       console.error("Alarm fetch error:", err);
//     }
//   };

//   // Fetch sensor data
//   const fetchData = async () => {
//     const pcbSerialNumber = activePCBRef.current;
//     if (!pcbSerialNumber) return;

//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Network response was not ok");

//       const data = await response.json();

//       if (data?.status !== "success" || !data?.data) return;
//       if (activePCBRef.current !== pcbSerialNumber) return;

//       const deviceData = data.data;
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
//         deviceId: pcbSerialNumber,
//         alarmOccurred: deviceData.alarm_occurred?.value,
//         isOnline: isOnline,
//       });

//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);

//       if (deviceData.hvac_busy?.value == "0") {
//         clearProcessingIfDone();
//       }
//     } catch (error) {
//       console.error("🔥 Fetch Error:", error);
//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);
//     }
//   };

//   // Start polling
//   useEffect(() => {
//     if (!activePCBRef.current) return;

//     if (fetchIntervalRef.current) {
//       clearInterval(fetchIntervalRef.current);
//       fetchIntervalRef.current = null;
//     }

//     fetchData();
//     fetchAllAlarms();

//     fetchIntervalRef.current = setInterval(() => {
//       fetchData();
//       fetchAllAlarms();
//     }, 1000);

//     return () => {
//       if (fetchIntervalRef.current) {
//         clearInterval(fetchIntervalRef.current);
//         fetchIntervalRef.current = null;
//       }
//     };
//   }, [activePCBRef.current]);

//   // Update active PCB ref when selected service changes
//   useEffect(() => {
//     if (selectedService?.pcb_serial_number) {
//       console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
//       activePCBRef.current = selectedService.pcb_serial_number;
//     }
//   }, [selectedService?.pcb_serial_number]);

//   // Processing message cycle functions
//   const MIN_PROCESSING_TIME = 5000;
  
//   const startProcessingCycle = () => {
//     processingMsgIndexRef.current = 0;
//     processingStartTimeRef.current = Date.now();
//     setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

//     processingTimerRef.current = setInterval(() => {
//       processingMsgIndexRef.current += 1;
//       const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
//       if (nextMsg) {
//         setProcessing({ status: true, message: nextMsg });
//       }
//     }, 10000);

//     hardStopTimerRef.current = setTimeout(() => {
//       stopProcessing();
//     }, 25000);
//   };

//   const stopProcessing = () => {
//     if (processingTimerRef.current) {
//       clearInterval(processingTimerRef.current);
//       processingTimerRef.current = null;
//     }
//     if (hardStopTimerRef.current) {
//       clearTimeout(hardStopTimerRef.current);
//       hardStopTimerRef.current = null;
//     }
//     setProcessing({ status: false, message: "" });
//   };

//   const clearProcessingIfDone = () => {
//     if (processingTimerRef.current || hardStopTimerRef.current) {
//       const elapsed = Date.now() - (processingStartTimeRef.current || 0);
//       if (elapsed >= MIN_PROCESSING_TIME) {
//         stopProcessing();
//       }
//     }
//   };

//   // Cleanup timers
//   useEffect(() => {
//     return () => {
//       if (processingTimerRef.current) clearInterval(processingTimerRef.current);
//       if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
//     };
//   }, []);

//   // Send mode command
//   const sendModeCommand = async (modeCode, modeName) => {
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(modeCode) || 3,
//         FS: parseInt(displayData.fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
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

//   // Send fan command
//   const sendFanCommand = async (fanSpeed) => {
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(displayData.mode) || 3,
//         FS: parseInt(fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
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

//   // Handle mode change
//   const handleModeChange = async (newMode) => {
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) return;
    
//     const newModeCode = MODE_CODE_MAP[newMode] || 1;
//     setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
//     if (displayData.powerStatus === "on") {
//       await sendModeCommand(newModeCode.toString(), newMode);
//     }
//   };

//   // Handle fan speed change
//   const handleFanSpeedChange = async (newPosition) => {
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) return;
    
//     const newSpeed = FAN_SPEEDS[newPosition];
//     setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));
    
//     if (displayData.powerStatus === "on") {
//       await sendFanCommand(newSpeed);
//     } else {
//       console.log(`Fan speed set to ${newSpeed} (will apply when power turns on)`);
//     }
//   };

//   // Handle fan click on button
//   const handleFanClick = (index) => {
//     handleFanSpeedChange(index);
//   };

//   // Send refresh to controller
//   const sendRefreshToController = async () => {
//     if (!selectedService?.pcb_serial_number) {
//       setRefreshStatus({ sending: false, success: false, message: "No device selected" });
//       return { success: false };
//     }

//     if (!serviceItemPermissions?.can_control_equipment) {
//       setRefreshStatus({ sending: false, success: false, message: "Control permissions not available" });
//       return { success: false };
//     }

//     try {
//       const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
      
//       if (result?.success) {
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

//   // Handle power toggle
//   const handlePowerToggle = async () => {
//     if (!selectedService?.pcb_serial_number) return;
//     if (processing.status || sensorData.hvacBusy == "1" || !serviceItemPermissions?.can_control_equipment) {
//       const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
//       setProcessing({ status: true, message: msg });
//       return;
//     }

//     startProcessingCycle();

//     const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
//     const isShutdown = sensorData?.fanSpeed == 3 || sensorData?.mode == 0;

//     const payload = {
//       Header: "0xAA",
//       DI: selectedService.pcb_serial_number,
//       MD: isShutdown ? "3" : sensorData.mode,
//       FS: isShutdown ? "0" : sensorData.fanSpeed,
//       SRT: sensorData.temperature,
//       HVAC: newHvacValue,
//       Footer: "0xZX",
//     };

//     try {
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
//       console.error("Error sending command:", error);
//       stopProcessing();
//     }
//   };

//   // Handle temp change
//   const handleTempChange = (newTemp) => {
//     console.log("Temperature changed:", newTemp);
//   };

//   // Pull-to-refresh handlers
//   const handleTouchStart = (e) => {
//     touchStartY.current = e.touches[0].clientY;
//   };

//   const handleTouchMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.touches[0].clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleTouchEnd = async () => {
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleMouseDown = (e) => {
//     touchStartY.current = e.clientY;
//     document.addEventListener("mousemove", handleMouseMove);
//     document.addEventListener("mouseup", handleMouseUp);
//   };

//   const handleMouseMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleMouseUp = async () => {
//     document.removeEventListener("mousemove", handleMouseMove);
//     document.removeEventListener("mouseup", handleMouseUp);
    
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleLogout = () => {
//     logout();
//     navigate("/");
//   };

//   const handleServiceSelect = (item) => {
//     setSelectedService(item);
//     activePCBRef.current = item.pcb_serial_number;
//     updateSelectedServiceItem(item.service_item_id);
//     setShowServiceDropdown(false);
//   };

//   const handleNavigation = (path) => {
//     if (!processing.status) navigate(path);
//   };

//   const getModeDescription = (code) => MODE_MAP[code] || "Fan";

//   const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
//   const indicatorRotation = pullProgress * 360;
//   const indicatorOpacity = pullProgress;

//   // Loading states
//   if (serviceItemsLoading || (loading && !manualRefresh)) {
//     return (
//       <div
//         className="mainmain-container"
//         style={{
//           backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//           minHeight: "100vh",
//           display: "flex",
//           justifyContent: "center",
//           alignItems: "center",
//           flexDirection: "column",
//           color: "white",
//         }}
//       >
//         <div style={{ color: "white", fontSize: "18px", marginBottom: "20px" }}>
//           Loading...
//         </div>
//         <button
//           onClick={handleLogout}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "8px",
//             backgroundColor: "rgba(255, 255, 255, 0.15)",
//             color: "white",
//             border: "1px solid white",
//             borderRadius: "8px",
//             padding: "8px 16px",
//             cursor: "pointer",
//             fontSize: "16px",
//           }}
//         >
//           <FiLogOut size={20} />
//           <span>Logout</span>
//         </button>
//       </div>
//     );
//   }

//   // No service items case
//   if (!serviceItemsLoading && serviceItems.length === 0) {
//     return (
//       <div className="mainmain-container" style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         minHeight: "100vh",
//         display: "flex",
//         flexDirection: "column",
//         justifyContent: "center",
//         alignItems: "center",
//         padding: "20px",
//         textAlign: "center"
//       }}>
//         <div className="logo">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" style={{ marginBottom: "20px" }} />
//         </div>
        
//         <div style={{
//           backgroundColor: "rgba(255, 255, 255, 0.1)",
//           padding: "40px",
//           borderRadius: "12px",
//           maxWidth: "500px",
//           width: "100%"
//         }}>
//           <h2 style={{ color: "white", marginBottom: "20px", fontSize: "24px" }}>
//             No Machines Assigned
//           </h2>
//           <p style={{ color: "white", marginBottom: "30px", fontSize: "16px", lineHeight: "1.5" }}>
//             You don't have any machines assigned to your account yet.
//           </p>
          
//           <button
//             onClick={handleLogout}
//             style={{
//               padding: "12px 24px",
//               backgroundColor: "rgba(255, 255, 255, 0.2)",
//               color: "white",
//               border: "1px solid rgba(255, 255, 255, 0.3)",
//               borderRadius: "6px",
//               cursor: "pointer",
//               fontSize: "16px",
//               display: "flex",
//               alignItems: "center",
//               gap: "8px",
//               margin: "0 auto"
//             }}
//           >
//             <FiLogOut size={18} />
//             Logout
//           </button>
//         </div>
        
//         <div className="footer-logo" style={{ marginTop: "40px" }}>
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div 
//       className="mainmain-container" 
//       style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         touchAction: "pan-y",
//       }}
//       ref={containerRef}
//       onTouchStart={handleTouchStart}
//       onTouchMove={handleTouchMove}
//       onTouchEnd={handleTouchEnd}
//       onMouseDown={handleMouseDown}
//     >
//       {/* Pull-to-refresh indicator */}
//       <div 
//         className="screen1-pull-refresh"
//         style={{
//           height: `${pullToRefresh.pullDistance}px`,
//           opacity: pullToRefresh.isPulling || pullToRefresh.isRefreshing ? 1 : 0,
//           transform: `translateY(${pullToRefresh.isPulling ? 0 : -30}px)`,
//           transition: pullToRefresh.isPulling ? 'none' : 'all 0.3s ease',
//         }}
//       >
//         <div className="screen1-refresh-content">
//           {pullToRefresh.isRefreshing ? (
//             <>
//               <div className="screen1-refresh-spinner"></div>
//               <span>Sending refresh command...</span>
//             </>
//           ) : (
//             <>
//               <FiRefreshCw 
//                 size={24} 
//                 style={{
//                   transform: `rotate(${indicatorRotation}deg)`,
//                   transition: 'transform 0.2s ease',
//                   opacity: indicatorOpacity,
//                 }}
//               />
//               <span>
//                 {pullToRefresh.pullDistance >= PULL_THRESHOLD 
//                   ? "Release to refresh" 
//                   : "Pull down to refresh"}
//               </span>
//             </>
//           )}
//         </div>
//       </div>

//       <div className="main-container">
//         {/* Refresh status toast */}
//         {refreshStatus.message && (
//           <div className={`screen1-refresh-status ${refreshStatus.success ? 'success' : 'error'}`}>
//             {refreshStatus.message}
//           </div>
//         )}

//         {/* Header: Service Dropdown + Power Button Row */}
//         <div className="header-controls-row">
//           {/* Service Dropdown */}
//           <div className="service-dropdown-wrapper">
//             <div className="service-dropdown-container" style={{ position: "relative" }}>
//               <div
//                 className="service-dropdown-header"
//                 onClick={() => setShowServiceDropdown(!showServiceDropdown)}
//                 style={{ position: "relative", cursor: "pointer" }}
//               >
//                 <span>
//                   {selectedService ? selectedService.service_item_name : "Select Service"}
//                 </span>

//                 {/* Global Alarm Badge */}
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
//                     const displayName = serviceItemsList.find(i => i.service_item_id === item.service_item)?.service_item_name || item.service_item;
//                     return (
//                       <div
//                         key={item.service_item}
//                         className="service-dropdown-item"
//                         onClick={() => {
//                           const fullItem = serviceItemsList.find(i => i.service_item_id === item.service_item);
//                           handleServiceSelect(fullItem || { service_item_id: item.service_item, service_item_name: displayName });
//                         }}
//                       >
//                         {displayName}
//                       </div>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Power Button */}
//           <div style={{ position: "relative" }}>
//             <button
//               className={`screen1-power-button ${processing.status ? "processing" : ""}`}
//               onClick={handlePowerToggle}
//               disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
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
//                 cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
//                 fontWeight: "bold",
//                 opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//               }}
//             >
//               <FiPower size={24} color="#fff" />
//               {processing.status && <span className="screen1-processing-indicator"></span>}
//             </button>
//             {sensorData.errorFlag == "1" && <div className="error-indicator" />}
//           </div>
//         </div>

//         {/* Logo below the row */}
//         <div className="logo-container">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
//         </div>

      
//         {/* Temperature Dial — dimmed when offline */}
//         <div style={{ pointerEvents: "none", opacity: sensorData.isOnline ? 1 : 0.35 }}>
//           <TemperatureDial
//             sensorData={sensorData}
//             onTempChange={handleTempChange}
//             fanSpeed={fanPosition}
//             initialTemperature={sensorData.temperature ?? 25}
//           />
//         </div>
//           {/* Offline banner between header and temperature dial */}
//         {!sensorData.isOnline && (
//           <div
//             style={{
//               backgroundColor: "rgba(0,0,0,0.55)",
//               color: "#fff",
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

//         {/* Status messages */}
//         {processing.status && (
//           <div className="screen1-processing-message">{processing.message}</div>
//         )}

//         {sensorData.errorFlag == "1" && (
//           <div className="screen1-error-message">⚠️ System Error Detected</div>
//         )}

//         {sensorData.hvacBusy == "1" && !processing.status && (
//           <div className="screen1-busy-message">⏳ System is currently busy</div>
//         )}

//         {!serviceItemPermissions?.can_control_equipment && (
//           <div className="warning-message">⚠️ Control permissions not available</div>
//         )}


//         {/* Environment Info */}
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
//         {/* ==================== MODES SECTION ==================== */}
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
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* ==================== FAN SPEED SECTION (BUTTONS STYLE) ==================== */}
//         <div className="fan-speed-section-in-footer">
//           <h3 className="fan-speed-heading">Fan Speed</h3>
//           <div className="fan-speed-buttons-row">
//             {FAN_LABELS.map((label, index) => (
//               <button
//                 key={label}
//                 onClick={() => handleFanClick(index)}
//                 className={`fan-speed-button ${
//                   fanPosition === index ? "fan-speed-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* Control Buttons */}
//         <div className="control-buttons">
//           <button
//             className={`control-btn ${!hasValidPCBSerial ? 'screen1-disabled-btn' : ''}`}
//             // onClick={() => {
//             //   if (hasValidPCBSerial && serviceItemPermissions?.can_control_equipment) {
//             //     navigate("/delegate-machinescreen2", { 
//             //       state: { sensorData, selectedService, userId, company_id }
//             //     });
//             //   }
//             // }}
//             disabled={!hasValidPCBSerial || !serviceItemPermissions?.can_control_equipment}
//             title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
//           >
//             <FiWind size={20} />
//             <span>Modes</span>
//             <span><strong>{getModeDescription(sensorData.mode)}</strong></span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => navigate("/Delegate-alarms", {
//               state: {
//                 alarmData: {
//                   alarmOccurred: sensorData.alarmOccurred,
//                   errorCount: errorCount,
//                   deviceId: sensorData.deviceId,
//                 },
//                 userId: userId,
//                 company_id: company_id
//               },
//             })}
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

//           <button
//             className="control-btn"
//             onClick={() => handleNavigation("/timers")}
//             disabled={!serviceItemPermissions?.can_control_equipment}
//           >
//             <FiWatch size={20} />
//             <span>Timers</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => handleNavigation("/settings")}
//           >
//             <FiSettings size={20} />
//             <span>Settings</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => handleNavigation("/delegate-home")}
//           >
//             <FiZap size={20} />
//             <span>Services</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={handleLogout}
//           >
//             <FiLogOut size={20} />
//             <span>Logout</span>
//           </button>
//         </div>

//         <div className="footer-logo">
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default DelegateScreen1;



// DelegateScreen1.js — Complete with all functionalities (Modes + Fan Speed in footer)
// import React, { useState, useEffect, useContext, useRef } from "react";
// import axios from "axios";
// import {
//   FiArrowLeft,
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
// import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
// import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
// import { useNavigate } from "react-router-dom"; 
// import { AuthContext } from "../../Components/AuthContext/AuthContext";
// import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";
// import baseURL from "../../Components/ApiUrl/Apiurl";
// import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
// import './DelegateMachineScreens.css'

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

// const FAN_SPEEDS = ["0", "1", "2"]; // 0=High, 1=Medium, 2=Low
// const FAN_LABELS = ["High", "Medium", "Low"];

// // Pull-to-refresh configuration
// const PULL_THRESHOLD = 80;
// const MAX_PULL = 120;

// // Progressive messages every 10s
// const PROCESSING_MESSAGES = [
//   "Sending command...",
//   "Almost done, please wait...",
//   "Waiting for device response...",
// ];

// // Helper functions
// const formatTemp = (temp) => {
//   if (temp == null) return "0.0";
//   const num = parseFloat(temp);
//   return isNaN(num) ? "0.0" : num.toFixed(1);
// };

// // Function to send HVAC=3 command
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

// const DelegateScreen1 = () => {
//   const { user, logout } = useContext(AuthContext);
//   const { 
//     selectedServiceItem,
//     getSelectedServiceDetails,
//     serviceItemPermissions,
//     serviceItems,
//     updateSelectedServiceItem,
//     loading: serviceItemsLoading 
//   } = useDelegateServiceItems();
  
//   const userId = user?.delegate_id;
//   const company_id = user?.company_id;
//   const navigate = useNavigate();

//   // Refs
//   const activePCBRef = useRef(null);
//   const fetchIntervalRef = useRef(null);
//   const processingTimerRef = useRef(null);
//   const processingMsgIndexRef = useRef(0);
//   const hardStopTimerRef = useRef(null);
//   const processingStartTimeRef = useRef(null);
//   const touchStartY = useRef(0);
//   const containerRef = useRef(null);

//   // Pull-to-refresh state
//   const [pullToRefresh, setPullToRefresh] = useState({
//     isPulling: false,
//     pullDistance: 0,
//     isRefreshing: false,
//   });
  
//   // State management
//   const [selectedService, setSelectedService] = useState(null);
//   const [showServiceDropdown, setShowServiceDropdown] = useState(false);
//   const [processing, setProcessing] = useState({ status: false, message: "" });
//   const [errorCount, setErrorCount] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [serviceItemsList, setServiceItemsList] = useState([]);
//   const [manualRefresh, setManualRefresh] = useState(false);
//   const [refreshStatus, setRefreshStatus] = useState({ 
//     sending: false, 
//     success: false, 
//     message: "" 
//   });
//   const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  
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

//   // Display data for local changes
//   const [displayData, setDisplayData] = useState({
//     fanSpeed: "0",
//     temperature: 25,
//     mode: "3",
//     powerStatus: "off",
//   });

//   // Sync displayData with sensorData
//   useEffect(() => {
//     setDisplayData({
//       fanSpeed: sensorData.fanSpeed,
//       temperature: sensorData.temperature,
//       mode: sensorData.mode,
//       powerStatus: sensorData.powerStatus,
//     });
//   }, [sensorData]);

//   // Check if selected service has PCB serial number
//   const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;
  
//   // Get current mode description
//   const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
  
//   // Get fan position
//   const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

//   // Fetch service items with names from API
//   useEffect(() => {
//     if (user?.company_id && user?.delegate_id) {
//       axios.get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
//         .then((response) => {
//           try {
//             const data = Array.isArray(response.data) ? response.data : 
//                         (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
//             setServiceItemsList(data);
//           } catch (error) {
//             console.error('Error processing service items data:', error);
//             setServiceItemsList([]);
//           }
//         })
//         .catch((error) => {
//           console.error('Error fetching service items:', error);
//           setServiceItemsList([]);
//         });
//     }
//   }, [user?.company_id, user?.delegate_id]);

//   // Get the complete service details when selectedServiceItem changes
//   useEffect(() => {
//     if (!serviceItemsLoading && selectedServiceItem) {
//       const serviceDetails = getSelectedServiceDetails();
//       console.log("Selected Service Details:", serviceDetails);
//       setSelectedService(serviceDetails);
//       if (serviceDetails?.pcb_serial_number) {
//         activePCBRef.current = serviceDetails.pcb_serial_number;
//       }
//     }
//   }, [selectedServiceItem, serviceItemsLoading, getSelectedServiceDetails]);

//   // Fetch all alarms for dropdown badge
//   const fetchAllAlarms = async () => {
//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Failed to fetch alarms");

//       const data = await response.json();

//       if (data.status !== "success" || !data.data) return;

//       const alarmCount = data.data.reduce((count, item) => {
//         const val = item.alarm_occurred?.value;
//         if (val && val !== "0") {
//           return count + Number(val);
//         }
//         return count;
//       }, 0);

//       setDropdownAlarmCount(alarmCount);
//     } catch (err) {
//       console.error("Alarm fetch error:", err);
//     }
//   };

//   // Fetch sensor data
//   const fetchData = async () => {
//     const pcbSerialNumber = activePCBRef.current;
//     if (!pcbSerialNumber) return;

//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Network response was not ok");

//       const data = await response.json();

//       if (data?.status !== "success" || !data?.data) return;
//       if (activePCBRef.current !== pcbSerialNumber) return;

//       const deviceData = data.data;
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
//         deviceId: pcbSerialNumber,
//         alarmOccurred: deviceData.alarm_occurred?.value,
//         isOnline: isOnline,
//       });

//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);

//       if (deviceData.hvac_busy?.value == "0") {
//         clearProcessingIfDone();
//       }
//     } catch (error) {
//       console.error("🔥 Fetch Error:", error);
//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);
//     }
//   };

//   // Start polling
//   useEffect(() => {
//     if (!activePCBRef.current) return;

//     if (fetchIntervalRef.current) {
//       clearInterval(fetchIntervalRef.current);
//       fetchIntervalRef.current = null;
//     }

//     fetchData();
//     fetchAllAlarms();

//     fetchIntervalRef.current = setInterval(() => {
//       fetchData();
//       fetchAllAlarms();
//     }, 1000);

//     return () => {
//       if (fetchIntervalRef.current) {
//         clearInterval(fetchIntervalRef.current);
//         fetchIntervalRef.current = null;
//       }
//     };
//   }, [activePCBRef.current]);

//   // Update active PCB ref when selected service changes
//   useEffect(() => {
//     if (selectedService?.pcb_serial_number) {
//       console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
//       activePCBRef.current = selectedService.pcb_serial_number;
//     }
//   }, [selectedService?.pcb_serial_number]);

//   // Processing message cycle functions
//   const MIN_PROCESSING_TIME = 5000;
  
//   const startProcessingCycle = () => {
//     processingMsgIndexRef.current = 0;
//     processingStartTimeRef.current = Date.now();
//     setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

//     processingTimerRef.current = setInterval(() => {
//       processingMsgIndexRef.current += 1;
//       const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
//       if (nextMsg) {
//         setProcessing({ status: true, message: nextMsg });
//       }
//     }, 10000);

//     hardStopTimerRef.current = setTimeout(() => {
//       stopProcessing();
//     }, 25000);
//   };

//   const stopProcessing = () => {
//     if (processingTimerRef.current) {
//       clearInterval(processingTimerRef.current);
//       processingTimerRef.current = null;
//     }
//     if (hardStopTimerRef.current) {
//       clearTimeout(hardStopTimerRef.current);
//       hardStopTimerRef.current = null;
//     }
//     setProcessing({ status: false, message: "" });
//   };

//   const clearProcessingIfDone = () => {
//     if (processingTimerRef.current || hardStopTimerRef.current) {
//       const elapsed = Date.now() - (processingStartTimeRef.current || 0);
//       if (elapsed >= MIN_PROCESSING_TIME) {
//         stopProcessing();
//       }
//     }
//   };

//   // Cleanup timers
//   useEffect(() => {
//     return () => {
//       if (processingTimerRef.current) clearInterval(processingTimerRef.current);
//       if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
//     };
//   }, []);

//   // Send mode command
//   const sendModeCommand = async (modeCode, modeName) => {
//     console.group("🎛️ MODE COMMAND SENT");
//     console.log("📱 Mode clicked:", modeName);
//     console.log("🔢 Mode code:", modeCode);
//     console.log("💻 Current display data:", {
//       mode: displayData.mode,
//       fanSpeed: displayData.fanSpeed,
//       temperature: displayData.temperature,
//       powerStatus: displayData.powerStatus
//     });
    
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(modeCode) || 3,
//         FS: parseInt(displayData.fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Mode command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Mode command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }
      
//       console.log("✅ Mode command sent successfully:", modeName);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending mode command:", error);
//       console.groupEnd();
//       stopProcessing();
//     }
//   };

//   // Send fan command
//   const sendFanCommand = async (fanSpeed) => {
//     const fanSpeedLabel = FAN_LABELS[parseInt(fanSpeed)] || fanSpeed;
//     console.group("🌀 FAN SPEED COMMAND SENT");
//     console.log("📱 Fan speed clicked:", fanSpeedLabel);
//     console.log("🔢 Fan speed code:", fanSpeed);
//     console.log("💻 Current display data:", {
//       mode: displayData.mode,
//       fanSpeed: displayData.fanSpeed,
//       temperature: displayData.temperature,
//       powerStatus: displayData.powerStatus
//     });
    
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(displayData.mode) || 3,
//         FS: parseInt(fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Fan command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Fan command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }
      
//       console.log("✅ Fan command sent successfully:", fanSpeedLabel);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending fan command:", error);
//       console.groupEnd();
//       stopProcessing();
//     }
//   };

//   // Handle mode change
//   const handleModeChange = async (newMode) => {
//     console.log("🔘 Mode button clicked:", newMode);
//     console.log("📊 Current state before mode change:", {
//       processing: processing.status,
//       isOnline: sensorData.isOnline,
//       canControl: serviceItemPermissions?.can_control_equipment,
//       powerStatus: displayData.powerStatus
//     });
    
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ Mode change blocked - Conditions not met:", {
//         processingActive: processing.status,
//         offline: !sensorData.isOnline,
//         noControl: !serviceItemPermissions?.can_control_equipment
//       });
//       return;
//     }
    
//     const newModeCode = MODE_CODE_MAP[newMode] || 1;
//     console.log("🔄 Updating display mode from", displayData.mode, "to", newModeCode);
//     setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
//     if (displayData.powerStatus === "on") {
//       console.log("⚡ Power is ON - Sending mode command to device");
//       await sendModeCommand(newModeCode.toString(), newMode);
//     } else {
//       console.log("💤 Power is OFF - Mode saved locally, will apply when power turns on");
//     }
//   };

//   // Handle fan speed change
//   const handleFanSpeedChange = async (newPosition) => {
//     const newSpeed = FAN_SPEEDS[newPosition];
//     const newSpeedLabel = FAN_LABELS[newPosition];
    
//     console.log("🌀 Fan speed button clicked:", newSpeedLabel);
//     console.log("📊 Current state before fan change:", {
//       processing: processing.status,
//       isOnline: sensorData.isOnline,
//       canControl: serviceItemPermissions?.can_control_equipment,
//       powerStatus: displayData.powerStatus,
//       currentSpeed: FAN_LABELS[fanPosition]
//     });
    
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ Fan change blocked - Conditions not met:", {
//         processingActive: processing.status,
//         offline: !sensorData.isOnline,
//         noControl: !serviceItemPermissions?.can_control_equipment
//       });
//       return;
//     }
    
//     console.log("🔄 Updating display fan speed from", displayData.fanSpeed, "to", newSpeed);
//     setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));
    
//     if (displayData.powerStatus === "on") {
//       console.log("⚡ Power is ON - Sending fan command to device");
//       await sendFanCommand(newSpeed);
//     } else {
//       console.log(`💤 Power is OFF - Fan speed set to ${newSpeedLabel} (will apply when power turns on)`);
//     }
//   };

//   // Handle fan click on button
//   const handleFanClick = (index) => {
//     console.log("🖱️ Fan button clicked at index:", index, "Label:", FAN_LABELS[index]);
//     handleFanSpeedChange(index);
//   };

//   // Send refresh to controller
//   const sendRefreshToController = async () => {
//     if (!selectedService?.pcb_serial_number) {
//       setRefreshStatus({ sending: false, success: false, message: "No device selected" });
//       return { success: false };
//     }

//     if (!serviceItemPermissions?.can_control_equipment) {
//       setRefreshStatus({ sending: false, success: false, message: "Control permissions not available" });
//       return { success: false };
//     }

//     try {
//       const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
      
//       if (result?.success) {
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

//   // Handle power toggle
//   const handlePowerToggle = async () => {
//     console.log("🔘 Power button clicked. Current status:", sensorData.powerStatus);
    
//     if (!selectedService?.pcb_serial_number) {
//       console.log("❌ No PCB serial number available");
//       return;
//     }
    
//     if (processing.status || sensorData.hvacBusy == "1" || !serviceItemPermissions?.can_control_equipment) {
//       const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
//       console.log("⚠️ Power toggle blocked:", msg);
//       setProcessing({ status: true, message: msg });
//       return;
//     }

//     startProcessingCycle();

//     const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
//     const isShutdown = sensorData?.fanSpeed == 3 || sensorData?.mode == 0;
    
//     console.log("⚡ Sending power command. New HVAC value:", newHvacValue);

//     const payload = {
//       Header: "0xAA",
//       DI: selectedService.pcb_serial_number,
//       MD: isShutdown ? "3" : sensorData.mode,
//       FS: isShutdown ? "0" : sensorData.fanSpeed,
//       SRT: sensorData.temperature,
//       HVAC: newHvacValue,
//       Footer: "0xZX",
//     };

//     try {
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
//       console.log("✅ Power command sent:", result);
//     } catch (error) {
//       console.error("Error sending power command:", error);
//       stopProcessing();
//     }
//   };

//   // Handle temp change
//   const handleTempChange = (newTemp) => {
//     console.log("🌡️ Temperature changed to:", newTemp);
//   };

//   // Pull-to-refresh handlers
//   const handleTouchStart = (e) => {
//     touchStartY.current = e.touches[0].clientY;
//   };

//   const handleTouchMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.touches[0].clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleTouchEnd = async () => {
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleMouseDown = (e) => {
//     touchStartY.current = e.clientY;
//     document.addEventListener("mousemove", handleMouseMove);
//     document.addEventListener("mouseup", handleMouseUp);
//   };

//   const handleMouseMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleMouseUp = async () => {
//     document.removeEventListener("mousemove", handleMouseMove);
//     document.removeEventListener("mouseup", handleMouseUp);
    
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleLogout = () => {
//     console.log("🚪 User logging out");
//     logout();
//     navigate("/");
//   };

//   const handleServiceSelect = (item) => {
//     console.log("📋 Service selected:", item.service_item_name, "PCB:", item.pcb_serial_number);
//     setSelectedService(item);
//     activePCBRef.current = item.pcb_serial_number;
//     updateSelectedServiceItem(item.service_item_id);
//     setShowServiceDropdown(false);
//   };

//   const handleNavigation = (path) => {
//     if (!processing.status) {
//       console.log("🧭 Navigating to:", path);
//       navigate(path);
//     } else {
//       console.log("⚠️ Navigation blocked - command in progress");
//     }
//   };

//   const getModeDescription = (code) => MODE_MAP[code] || "Fan";

//   const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
//   const indicatorRotation = pullProgress * 360;
//   const indicatorOpacity = pullProgress;

//   // Loading states
//   if (serviceItemsLoading || (loading && !manualRefresh)) {
//     return (
//       <div
//         className="mainmain-container"
//         style={{
//           backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//           minHeight: "100vh",
//           display: "flex",
//           justifyContent: "center",
//           alignItems: "center",
//           flexDirection: "column",
//           color: "white",
//         }}
//       >
//         <div style={{ color: "white", fontSize: "18px", marginBottom: "20px" }}>
//           Loading...
//         </div>
//         <button
//           onClick={handleLogout}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "8px",
//             backgroundColor: "rgba(255, 255, 255, 0.15)",
//             color: "white",
//             border: "1px solid white",
//             borderRadius: "8px",
//             padding: "8px 16px",
//             cursor: "pointer",
//             fontSize: "16px",
//           }}
//         >
//           <FiLogOut size={20} />
//           <span>Logout</span>
//         </button>
//       </div>
//     );
//   }

//   // No service items case
//   if (!serviceItemsLoading && serviceItems.length === 0) {
//     return (
//       <div className="mainmain-container" style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         minHeight: "100vh",
//         display: "flex",
//         flexDirection: "column",
//         justifyContent: "center",
//         alignItems: "center",
//         padding: "20px",
//         textAlign: "center"
//       }}>
//         <div className="logo">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" style={{ marginBottom: "20px" }} />
//         </div>
        
//         <div style={{
//           backgroundColor: "rgba(255, 255, 255, 0.1)",
//           padding: "40px",
//           borderRadius: "12px",
//           maxWidth: "500px",
//           width: "100%"
//         }}>
//           <h2 style={{ color: "white", marginBottom: "20px", fontSize: "24px" }}>
//             No Machines Assigned
//           </h2>
//           <p style={{ color: "white", marginBottom: "30px", fontSize: "16px", lineHeight: "1.5" }}>
//             You don't have any machines assigned to your account yet.
//           </p>
          
//           <button
//             onClick={handleLogout}
//             style={{
//               padding: "12px 24px",
//               backgroundColor: "rgba(255, 255, 255, 0.2)",
//               color: "white",
//               border: "1px solid rgba(255, 255, 255, 0.3)",
//               borderRadius: "6px",
//               cursor: "pointer",
//               fontSize: "16px",
//               display: "flex",
//               alignItems: "center",
//               gap: "8px",
//               margin: "0 auto"
//             }}
//           >
//             <FiLogOut size={18} />
//             Logout
//           </button>
//         </div>
        
//         <div className="footer-logo" style={{ marginTop: "40px" }}>
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div 
//       className="mainmain-container" 
//       style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         touchAction: "pan-y",
//       }}
//       ref={containerRef}
//       onTouchStart={handleTouchStart}
//       onTouchMove={handleTouchMove}
//       onTouchEnd={handleTouchEnd}
//       onMouseDown={handleMouseDown}
//     >
//       {/* Pull-to-refresh indicator */}
//       <div 
//         className="screen1-pull-refresh"
//         style={{
//           height: `${pullToRefresh.pullDistance}px`,
//           opacity: pullToRefresh.isPulling || pullToRefresh.isRefreshing ? 1 : 0,
//           transform: `translateY(${pullToRefresh.isPulling ? 0 : -30}px)`,
//           transition: pullToRefresh.isPulling ? 'none' : 'all 0.3s ease',
//         }}
//       >
//         <div className="screen1-refresh-content">
//           {pullToRefresh.isRefreshing ? (
//             <>
//               <div className="screen1-refresh-spinner"></div>
//               <span>Sending refresh command...</span>
//             </>
//           ) : (
//             <>
//               <FiRefreshCw 
//                 size={24} 
//                 style={{
//                   transform: `rotate(${indicatorRotation}deg)`,
//                   transition: 'transform 0.2s ease',
//                   opacity: indicatorOpacity,
//                 }}
//               />
//               <span>
//                 {pullToRefresh.pullDistance >= PULL_THRESHOLD 
//                   ? "Release to refresh" 
//                   : "Pull down to refresh"}
//               </span>
//             </>
//           )}
//         </div>
//       </div>

//       <div className="main-container">
//         {/* Refresh status toast */}
//         {refreshStatus.message && (
//           <div className={`screen1-refresh-status ${refreshStatus.success ? 'success' : 'error'}`}>
//             {refreshStatus.message}
//           </div>
//         )}

//         {/* Header: Service Dropdown + Power Button Row */}
//         <div className="header-controls-row">
//           {/* Service Dropdown */}
//           <div className="service-dropdown-wrapper">
//             <div className="service-dropdown-container" style={{ position: "relative" }}>
//               <div
//                 className="service-dropdown-header"
//                 onClick={() => setShowServiceDropdown(!showServiceDropdown)}
//                 style={{ position: "relative", cursor: "pointer" }}
//               >
//                 <span>
//                   {selectedService ? selectedService.service_item_name : "Select Service"}
//                 </span>

//                 {/* Global Alarm Badge */}
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
//                     const displayName = serviceItemsList.find(i => i.service_item_id === item.service_item)?.service_item_name || item.service_item;
//                     return (
//                       <div
//                         key={item.service_item}
//                         className="service-dropdown-item"
//                         onClick={() => {
//                           const fullItem = serviceItemsList.find(i => i.service_item_id === item.service_item);
//                           handleServiceSelect(fullItem || { service_item_id: item.service_item, service_item_name: displayName });
//                         }}
//                       >
//                         {displayName}
//                       </div>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Power Button */}
//           <div style={{ position: "relative" }}>
//             <button
//               className={`screen1-power-button ${processing.status ? "processing" : ""}`}
//               onClick={handlePowerToggle}
//               disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
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
//                 cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
//                 fontWeight: "bold",
//                 opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//               }}
//             >
//               <FiPower size={24} color="#fff" />
//               {processing.status && <span className="screen1-processing-indicator"></span>}
//             </button>
//             {sensorData.errorFlag == "1" && <div className="error-indicator" />}
//           </div>
//         </div>

//         {/* Logo below the row */}
//         <div className="logo-container">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
//         </div>

      
//         {/* Temperature Dial — dimmed when offline */}
//         <div style={{ pointerEvents: "none", opacity: sensorData.isOnline ? 1 : 0.35 }}>
//           <TemperatureDial
//             sensorData={sensorData}
//             onTempChange={handleTempChange}
//             fanSpeed={fanPosition}
//             initialTemperature={sensorData.temperature ?? 25}
//           />
//         </div>
//           {/* Offline banner between header and temperature dial */}
//         {!sensorData.isOnline && (
//           <div
//             style={{
//               // backgroundColor: "rgba(0,0,0,0.55)",
//               // color: "#fff",
//                    color: "rgba(0,0,0,0.55)",
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

//         {/* Status messages */}
//         {processing.status && (
//           <div className="screen1-processing-message">{processing.message}</div>
//         )}

//         {sensorData.errorFlag == "1" && (
//           <div className="screen1-error-message">⚠️ System Error Detected</div>
//         )}

//         {sensorData.hvacBusy == "1" && !processing.status && (
//           <div className="screen1-busy-message">⏳ System is currently busy</div>
//         )}

//         {!serviceItemPermissions?.can_control_equipment && (
//           <div className="warning-message">⚠️ Control permissions not available</div>
//         )}


//         {/* Environment Info */}
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
//         {/* ==================== MODES SECTION ==================== */}
//         <div className="modes-section-in-footer">
//           <h3 className="modes-heading">Modes</h3>
//           <div className="modes-row">
//             {Object.values(MODE_MAP).map((mode) => (
//               <button
//                 key={mode}
//                 onClick={() => {
//                   console.log("🖱️ Mode button clicked in footer:", mode);
//                   handleModeChange(mode);
//                 }}
//                 className={`modes-button ${
//                   currentModeDescription === mode ? "modes-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* ==================== FAN SPEED SECTION (BUTTONS STYLE) ==================== */}
//         <div className="fan-speed-section-in-footer">
//           <h3 className="fan-speed-heading">Fan Speed</h3>
//           <div className="fan-speed-buttons-row">
//             {FAN_LABELS.map((label, index) => (
//               <button
//                 key={label}
//                 onClick={() => {
//                   console.log(`🖱️ Fan speed button clicked in footer: ${label} (index: ${index})`);
//                   handleFanClick(index);
//                 }}
//                 className={`fan-speed-button ${
//                   fanPosition === index ? "fan-speed-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* Control Buttons */}
//         <div className="control-buttons">
//           <button
//             className={`control-btn ${!hasValidPCBSerial ? 'screen1-disabled-btn' : ''}`}
//             // onClick={() => {
//             //   console.log("🔘 Modes control button clicked");
//             //   if (hasValidPCBSerial && serviceItemPermissions?.can_control_equipment) {
//             //     console.log("📱 Navigating to delegate-machinescreen2 with:", {
//             //       sensorData,
//             //       selectedService,
//             //       userId,
//             //       company_id
//             //     });
//             //     navigate("/delegate-machinescreen2", { 
//             //       state: { sensorData, selectedService, userId, company_id }
//             //     });
//             //   } else {
//             //     console.log("⚠️ Navigation blocked - Missing permissions or PCB:", {
//             //       hasPCB: hasValidPCBSerial,
//             //       canControl: serviceItemPermissions?.can_control_equipment
//             //     });
//             //   }
//             // }}
//             disabled={!hasValidPCBSerial || !serviceItemPermissions?.can_control_equipment}
//             title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
//           >
//             <FiWind size={20} />
//             <span>Modes</span>
//             <span><strong>{getModeDescription(sensorData.mode)}</strong></span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🔔 Alarms button clicked. Error count:", errorCount);
//               navigate("/Delegate-alarms", {
//                 state: {
//                   alarmData: {
//                     alarmOccurred: sensorData.alarmOccurred,
//                     errorCount: errorCount,
//                     deviceId: sensorData.deviceId,
//                   },
//                   userId: userId,
//                   company_id: company_id
//                 },
//               });
//             }}
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

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("⏰ Timers button clicked");
//               handleNavigation("/timers");
//             }}
//             disabled={!serviceItemPermissions?.can_control_equipment}
//           >
//             <FiWatch size={20} />
//             <span>Timers</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("⚙️ Settings button clicked");
//               handleNavigation("/settings");
//             }}
//           >
//             <FiSettings size={20} />
//             <span>Settings</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🛠️ Services button clicked - navigating to delegate-home");
//               handleNavigation("/delegate-home");
//             }}
//           >
//             <FiZap size={20} />
//             <span>Services</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🚪 Logout button clicked");
//               handleLogout();
//             }}
//           >
//             <FiLogOut size={20} />
//             <span>Logout</span>
//           </button>
//         </div>

//         <div className="footer-logo">
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default DelegateScreen1;



// import React, { useState, useEffect, useContext, useRef } from "react";
// import axios from "axios";
// import {
//   FiArrowLeft,
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
// import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
// import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
// import { useNavigate } from "react-router-dom"; 
// import { AuthContext } from "../../Components/AuthContext/AuthContext";
// import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";
// import baseURL from "../../Components/ApiUrl/Apiurl";
// import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
// import './DelegateMachineScreens.css'

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

// const FAN_SPEEDS = ["0", "1", "2"]; // 0=High, 1=Medium, 2=Low
// const FAN_LABELS = ["High", "Medium", "Low"];

// // Pull-to-refresh configuration
// const PULL_THRESHOLD = 80;
// const MAX_PULL = 120;

// // Progressive messages every 10s
// const PROCESSING_MESSAGES = [
//   "Sending command...",
//   "Almost done, please wait...",
//   "Waiting for device response...",
// ];

// // Helper functions
// const formatTemp = (temp) => {
//   if (temp == null) return "0.0";
//   const num = parseFloat(temp);
//   return isNaN(num) ? "0.0" : num.toFixed(1);
// };

// // Function to send HVAC=3 command
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

// const DelegateScreen1 = () => {
//   const { user, logout } = useContext(AuthContext);
//   const { 
//     selectedServiceItem,
//     getSelectedServiceDetails,
//     serviceItemPermissions,
//     serviceItems,
//     updateSelectedServiceItem,
//     loading: serviceItemsLoading 
//   } = useDelegateServiceItems();
  
//   const userId = user?.delegate_id;
//   const company_id = user?.company_id;
//   const navigate = useNavigate();

//   // Refs
//   const activePCBRef = useRef(null);
//   const fetchIntervalRef = useRef(null);
//   const processingTimerRef = useRef(null);
//   const processingMsgIndexRef = useRef(0);
//   const hardStopTimerRef = useRef(null);
//   const processingStartTimeRef = useRef(null);
//   const touchStartY = useRef(0);
//   const containerRef = useRef(null);

//   // Pull-to-refresh state
//   const [pullToRefresh, setPullToRefresh] = useState({
//     isPulling: false,
//     pullDistance: 0,
//     isRefreshing: false,
//   });
  
//   // State management
//   const [selectedService, setSelectedService] = useState(null);
//   const [showServiceDropdown, setShowServiceDropdown] = useState(false);
//   const [processing, setProcessing] = useState({ status: false, message: "" });
//   const [errorCount, setErrorCount] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [serviceItemsList, setServiceItemsList] = useState([]);
//   const [manualRefresh, setManualRefresh] = useState(false);
//   const [refreshStatus, setRefreshStatus] = useState({ 
//     sending: false, 
//     success: false, 
//     message: "" 
//   });
//   const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  
//   // Service switching states
//   const [showConfirmDialog, setShowConfirmDialog] = useState(false);
//   const [pendingService, setPendingService] = useState(null);
//   const [switchingService, setSwitchingService] = useState(false);
//   const [loadingMessage, setLoadingMessage] = useState("");
//   const [switchNotification, setSwitchNotification] = useState({ show: false, message: "" });
  
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

//   // Display data for local changes
//   const [displayData, setDisplayData] = useState({
//     fanSpeed: "0",
//     temperature: 25,
//     mode: "3",
//     powerStatus: "off",
//   });

//   // Sync displayData with sensorData
//   useEffect(() => {
//     setDisplayData({
//       fanSpeed: sensorData.fanSpeed,
//       temperature: sensorData.temperature,
//       mode: sensorData.mode,
//       powerStatus: sensorData.powerStatus,
//     });
//   }, [sensorData]);

//   // Check if selected service has PCB serial number
//   const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;
  
//   // Get current mode description
//   const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
  
//   // Get fan position
//   const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

//   // Fetch service items with names from API
//   useEffect(() => {
//     if (user?.company_id && user?.delegate_id) {
//       axios.get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
//         .then((response) => {
//           try {
//             const data = Array.isArray(response.data) ? response.data : 
//                         (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
//             setServiceItemsList(data);
//           } catch (error) {
//             console.error('Error processing service items data:', error);
//             setServiceItemsList([]);
//           }
//         })
//         .catch((error) => {
//           console.error('Error fetching service items:', error);
//           setServiceItemsList([]);
//         });
//     }
//   }, [user?.company_id, user?.delegate_id]);

//   // Get the complete service details when selectedServiceItem changes
//   useEffect(() => {
//     if (!serviceItemsLoading && selectedServiceItem) {
//       const serviceDetails = getSelectedServiceDetails();
//       console.log("Selected Service Details:", serviceDetails);
//       setSelectedService(serviceDetails);
//       if (serviceDetails?.pcb_serial_number) {
//         activePCBRef.current = serviceDetails.pcb_serial_number;
//       }
//     }
//   }, [selectedServiceItem, serviceItemsLoading, getSelectedServiceDetails]);

//   // Fetch all alarms for dropdown badge
//   const fetchAllAlarms = async () => {
//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Failed to fetch alarms");

//       const data = await response.json();

//       if (data.status !== "success" || !data.data) return;

//       const alarmCount = data.data.reduce((count, item) => {
//         const val = item.alarm_occurred?.value;
//         if (val && val !== "0") {
//           return count + Number(val);
//         }
//         return count;
//       }, 0);

//       setDropdownAlarmCount(alarmCount);
//     } catch (err) {
//       console.error("Alarm fetch error:", err);
//     }
//   };

//   // Fetch sensor data
//   const fetchData = async () => {
//     const pcbSerialNumber = activePCBRef.current;
//     if (!pcbSerialNumber) return;

//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Network response was not ok");

//       const data = await response.json();

//       if (data?.status !== "success" || !data?.data) return;
//       if (activePCBRef.current !== pcbSerialNumber) return;

//       const deviceData = data.data;
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
//         deviceId: pcbSerialNumber,
//         alarmOccurred: deviceData.alarm_occurred?.value,
//         isOnline: isOnline,
//       });

//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);

//       if (deviceData.hvac_busy?.value == "0") {
//         clearProcessingIfDone();
//       }
//     } catch (error) {
//       console.error("🔥 Fetch Error:", error);
//       setLoading(false);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);
//     }
//   };

//   // Start polling
//   useEffect(() => {
//     if (!activePCBRef.current) return;

//     if (fetchIntervalRef.current) {
//       clearInterval(fetchIntervalRef.current);
//       fetchIntervalRef.current = null;
//     }

//     fetchData();
//     fetchAllAlarms();

//     fetchIntervalRef.current = setInterval(() => {
//       fetchData();
//       fetchAllAlarms();
//     }, 20000);

//     return () => {
//       if (fetchIntervalRef.current) {
//         clearInterval(fetchIntervalRef.current);
//         fetchIntervalRef.current = null;
//       }
//     };
//   }, [activePCBRef.current]);

//   // Update active PCB ref when selected service changes
//   useEffect(() => {
//     if (selectedService?.pcb_serial_number) {
//       console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
//       activePCBRef.current = selectedService.pcb_serial_number;
//     }
//   }, [selectedService?.pcb_serial_number]);

//   // Processing message cycle functions
//   const MIN_PROCESSING_TIME = 5000;
  
//   const startProcessingCycle = () => {
//     processingMsgIndexRef.current = 0;
//     processingStartTimeRef.current = Date.now();
//     setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

//     processingTimerRef.current = setInterval(() => {
//       processingMsgIndexRef.current += 1;
//       const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
//       if (nextMsg) {
//         setProcessing({ status: true, message: nextMsg });
//       }
//     }, 10000);

//     hardStopTimerRef.current = setTimeout(() => {
//       stopProcessing();
//     }, 25000);
//   };

//   const stopProcessing = () => {
//     if (processingTimerRef.current) {
//       clearInterval(processingTimerRef.current);
//       processingTimerRef.current = null;
//     }
//     if (hardStopTimerRef.current) {
//       clearTimeout(hardStopTimerRef.current);
//       hardStopTimerRef.current = null;
//     }
//     setProcessing({ status: false, message: "" });
//   };

//   const clearProcessingIfDone = () => {
//     if (processingTimerRef.current || hardStopTimerRef.current) {
//       const elapsed = Date.now() - (processingStartTimeRef.current || 0);
//       if (elapsed >= MIN_PROCESSING_TIME) {
//         stopProcessing();
//       }
//     }
//   };

//   // Cleanup timers
//   useEffect(() => {
//     return () => {
//       if (processingTimerRef.current) clearInterval(processingTimerRef.current);
//       if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
//     };
//   }, []);

//   // Send mode command
//   const sendModeCommand = async (modeCode, modeName) => {
//     console.group("🎛️ MODE COMMAND SENT");
//     console.log("📱 Mode clicked:", modeName);
//     console.log("🔢 Mode code:", modeCode);
//     console.log("💻 Current display data:", {
//       mode: displayData.mode,
//       fanSpeed: displayData.fanSpeed,
//       temperature: displayData.temperature,
//       powerStatus: displayData.powerStatus
//     });
    
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(modeCode) || 3,
//         FS: parseInt(displayData.fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Mode command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Mode command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }
      
//       console.log("✅ Mode command sent successfully:", modeName);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending mode command:", error);
//       console.groupEnd();
//       stopProcessing();
//     }
//   };

//   // Send fan command
//   const sendFanCommand = async (fanSpeed) => {
//     const fanSpeedLabel = FAN_LABELS[parseInt(fanSpeed)] || fanSpeed;
//     console.group("🌀 FAN SPEED COMMAND SENT");
//     console.log("📱 Fan speed clicked:", fanSpeedLabel);
//     console.log("🔢 Fan speed code:", fanSpeed);
//     console.log("💻 Current display data:", {
//       mode: displayData.mode,
//       fanSpeed: displayData.fanSpeed,
//       temperature: displayData.temperature,
//       powerStatus: displayData.powerStatus
//     });
    
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(displayData.mode) || 3,
//         FS: parseInt(fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Fan command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Fan command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }
      
//       console.log("✅ Fan command sent successfully:", fanSpeedLabel);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending fan command:", error);
//       console.groupEnd();
//       stopProcessing();
//     }
//   };

//   // Handle mode change
//   const handleModeChange = async (newMode) => {
//     console.log("🔘 Mode button clicked:", newMode);
//     console.log("📊 Current state before mode change:", {
//       processing: processing.status,
//       isOnline: sensorData.isOnline,
//       canControl: serviceItemPermissions?.can_control_equipment,
//       powerStatus: displayData.powerStatus
//     });
    
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ Mode change blocked - Conditions not met:", {
//         processingActive: processing.status,
//         offline: !sensorData.isOnline,
//         noControl: !serviceItemPermissions?.can_control_equipment
//       });
//       return;
//     }
    
//     const newModeCode = MODE_CODE_MAP[newMode] || 1;
//     console.log("🔄 Updating display mode from", displayData.mode, "to", newModeCode);
//     setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
//     if (displayData.powerStatus === "on") {
//       console.log("⚡ Power is ON - Sending mode command to device");
//       await sendModeCommand(newModeCode.toString(), newMode);
//     } else {
//       console.log("💤 Power is OFF - Mode saved locally, will apply when power turns on");
//     }
//   };

//   // Handle fan speed change
//   const handleFanSpeedChange = async (newPosition) => {
//     const newSpeed = FAN_SPEEDS[newPosition];
//     const newSpeedLabel = FAN_LABELS[newPosition];
    
//     console.log("🌀 Fan speed button clicked:", newSpeedLabel);
//     console.log("📊 Current state before fan change:", {
//       processing: processing.status,
//       isOnline: sensorData.isOnline,
//       canControl: serviceItemPermissions?.can_control_equipment,
//       powerStatus: displayData.powerStatus,
//       currentSpeed: FAN_LABELS[fanPosition]
//     });
    
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ Fan change blocked - Conditions not met:", {
//         processingActive: processing.status,
//         offline: !sensorData.isOnline,
//         noControl: !serviceItemPermissions?.can_control_equipment
//       });
//       return;
//     }
    
//     console.log("🔄 Updating display fan speed from", displayData.fanSpeed, "to", newSpeed);
//     setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));
    
//     if (displayData.powerStatus === "on") {
//       console.log("⚡ Power is ON - Sending fan command to device");
//       await sendFanCommand(newSpeed);
//     } else {
//       console.log(`💤 Power is OFF - Fan speed set to ${newSpeedLabel} (will apply when power turns on)`);
//     }
//   };

//   // Handle fan click on button
//   const handleFanClick = (index) => {
//     console.log("🖱️ Fan button clicked at index:", index, "Label:", FAN_LABELS[index]);
//     handleFanSpeedChange(index);
//   };

//   // Send refresh to controller
//   const sendRefreshToController = async () => {
//     if (!selectedService?.pcb_serial_number) {
//       setRefreshStatus({ sending: false, success: false, message: "No device selected" });
//       return { success: false };
//     }

//     if (!serviceItemPermissions?.can_control_equipment) {
//       setRefreshStatus({ sending: false, success: false, message: "Control permissions not available" });
//       return { success: false };
//     }

//     try {
//       const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
      
//       if (result?.success) {
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

//   // Handle power toggle
//   const handlePowerToggle = async () => {
//     console.log("🔘 Power button clicked. Current status:", sensorData.powerStatus);
    
//     if (!selectedService?.pcb_serial_number) {
//       console.log("❌ No PCB serial number available");
//       return;
//     }
    
//     if (processing.status || sensorData.hvacBusy == "1" || !serviceItemPermissions?.can_control_equipment) {
//       const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
//       console.log("⚠️ Power toggle blocked:", msg);
//       setProcessing({ status: true, message: msg });
//       return;
//     }

//     startProcessingCycle();

//     const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
//     const isShutdown = sensorData?.fanSpeed == 3 || sensorData?.mode == 0;
    
//     console.log("⚡ Sending power command. New HVAC value:", newHvacValue);

//     const payload = {
//       Header: "0xAA",
//       DI: selectedService.pcb_serial_number,
//       MD: isShutdown ? "3" : sensorData.mode,
//       FS: isShutdown ? "0" : sensorData.fanSpeed,
//       SRT: sensorData.temperature,
//       HVAC: newHvacValue,
//       Footer: "0xZX",
//     };

//     try {
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
//       console.log("✅ Power command sent:", result);
//     } catch (error) {
//       console.error("Error sending power command:", error);
//       stopProcessing();
//     }
//   };

//   // Handle temp change
//   const handleTempChange = (newTemp) => {
//     console.log("🌡️ Temperature changed to:", newTemp);
//   };

//   // Pull-to-refresh handlers
//   const handleTouchStart = (e) => {
//     touchStartY.current = e.touches[0].clientY;
//   };

//   const handleTouchMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.touches[0].clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleTouchEnd = async () => {
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleMouseDown = (e) => {
//     touchStartY.current = e.clientY;
//     document.addEventListener("mousemove", handleMouseMove);
//     document.addEventListener("mouseup", handleMouseUp);
//   };

//   const handleMouseMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleMouseUp = async () => {
//     document.removeEventListener("mousemove", handleMouseMove);
//     document.removeEventListener("mouseup", handleMouseUp);
    
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleLogout = () => {
//     console.log("🚪 User logging out");
//     logout();
//     navigate("/");
//   };

//   // Updated handleServiceSelect with confirmation
//   const handleServiceSelect = (item) => {
//     // Don't allow switching to the same service
//     if (selectedService?.service_item_id === item.service_item_id) {
//       setShowServiceDropdown(false);
//       return;
//     }
    
//     // Show confirmation dialog before switching
//     setPendingService(item);
//     setShowConfirmDialog(true);
//     setShowServiceDropdown(false);
//   };

//   // Confirm service switch
//   const confirmServiceSwitch = () => {
//     if (!pendingService) return;
    
//     setShowConfirmDialog(false);
//     setSwitchingService(true);
//     setLoadingMessage(`Switching to ${pendingService.service_item_name}...`);
    
//     // Update the service after a short delay for UX
//     setTimeout(() => {
//       setSelectedService(pendingService);
//       activePCBRef.current = pendingService.pcb_serial_number;
//       updateSelectedServiceItem(pendingService.service_item_id);
      
//       // Show success notification
//       setSwitchNotification({ 
//         show: true, 
//         message: `Successfully switched to ${pendingService.service_item_name}` 
//       });
      
//       // Hide notification after 3 seconds
//       setTimeout(() => {
//         setSwitchNotification({ show: false, message: "" });
//       }, 3000);
      
//       // Clear loading state
//       setTimeout(() => {
//         setSwitchingService(false);
//         setLoadingMessage("");
//       }, 1500);
//     }, 500);
//   };

//   // Cancel service switch
//   const cancelServiceSwitch = () => {
//     setShowConfirmDialog(false);
//     setPendingService(null);
//   };

//   const handleNavigation = (path) => {
//     if (!processing.status) {
//       console.log("🧭 Navigating to:", path);
//       navigate(path);
//     } else {
//       console.log("⚠️ Navigation blocked - command in progress");
//     }
//   };

//   const getModeDescription = (code) => MODE_MAP[code] || "Fan";

//   const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
//   const indicatorRotation = pullProgress * 360;
//   const indicatorOpacity = pullProgress;

//   // Loading states
//   if (serviceItemsLoading || (loading && !manualRefresh)) {
//     return (
//       <div
//         className="mainmain-container"
//         style={{
//           backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//           minHeight: "100vh",
//           display: "flex",
//           justifyContent: "center",
//           alignItems: "center",
//           flexDirection: "column",
//           color: "white",
//         }}
//       >
//         <div style={{ color: "white", fontSize: "18px", marginBottom: "20px" }}>
//           Loading...
//         </div>
//         <button
//           onClick={handleLogout}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "8px",
//             backgroundColor: "rgba(255, 255, 255, 0.15)",
//             color: "white",
//             border: "1px solid white",
//             borderRadius: "8px",
//             padding: "8px 16px",
//             cursor: "pointer",
//             fontSize: "16px",
//           }}
//         >
//           <FiLogOut size={20} />
//           <span>Logout</span>
//         </button>
//       </div>
//     );
//   }

//   // No service items case
//   if (!serviceItemsLoading && serviceItems.length === 0) {
//     return (
//       <div className="mainmain-container" style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         minHeight: "100vh",
//         display: "flex",
//         flexDirection: "column",
//         justifyContent: "center",
//         alignItems: "center",
//         padding: "20px",
//         textAlign: "center"
//       }}>
//         <div className="logo">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" style={{ marginBottom: "20px" }} />
//         </div>
        
//         <div style={{
//           backgroundColor: "rgba(255, 255, 255, 0.1)",
//           padding: "40px",
//           borderRadius: "12px",
//           maxWidth: "500px",
//           width: "100%"
//         }}>
//           <h2 style={{ color: "white", marginBottom: "20px", fontSize: "24px" }}>
//             No Machines Assigned
//           </h2>
//           <p style={{ color: "white", marginBottom: "30px", fontSize: "16px", lineHeight: "1.5" }}>
//             You don't have any machines assigned to your account yet.
//           </p>
          
//           <button
//             onClick={handleLogout}
//             style={{
//               padding: "12px 24px",
//               backgroundColor: "rgba(255, 255, 255, 0.2)",
//               color: "white",
//               border: "1px solid rgba(255, 255, 255, 0.3)",
//               borderRadius: "6px",
//               cursor: "pointer",
//               fontSize: "16px",
//               display: "flex",
//               alignItems: "center",
//               gap: "8px",
//               margin: "0 auto"
//             }}
//           >
//             <FiLogOut size={18} />
//             Logout
//           </button>
//         </div>
        
//         <div className="footer-logo" style={{ marginTop: "40px" }}>
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div 
//       className="mainmain-container" 
//       style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         touchAction: "pan-y",
//       }}
//       ref={containerRef}
//       onTouchStart={handleTouchStart}
//       onTouchMove={handleTouchMove}
//       onTouchEnd={handleTouchEnd}
//       onMouseDown={handleMouseDown}
//     >
//       {/* Pull-to-refresh indicator */}
//       <div 
//         className="screen1-pull-refresh"
//         style={{
//           height: `${pullToRefresh.pullDistance}px`,
//           opacity: pullToRefresh.isPulling || pullToRefresh.isRefreshing ? 1 : 0,
//           transform: `translateY(${pullToRefresh.isPulling ? 0 : -30}px)`,
//           transition: pullToRefresh.isPulling ? 'none' : 'all 0.3s ease',
//         }}
//       >
//         <div className="screen1-refresh-content">
//           {pullToRefresh.isRefreshing ? (
//             <>
//               <div className="screen1-refresh-spinner"></div>
//               <span>Sending refresh command...</span>
//             </>
//           ) : (
//             <>
//               <FiRefreshCw 
//                 size={24} 
//                 style={{
//                   transform: `rotate(${indicatorRotation}deg)`,
//                   transition: 'transform 0.2s ease',
//                   opacity: indicatorOpacity,
//                 }}
//               />
//               <span>
//                 {pullToRefresh.pullDistance >= PULL_THRESHOLD 
//                   ? "Release to refresh" 
//                   : "Pull down to refresh"}
//               </span>
//             </>
//           )}
//         </div>
//       </div>

//       <div className="main-container">
//         {/* Refresh status toast */}
//         {refreshStatus.message && (
//           <div className={`screen1-refresh-status ${refreshStatus.success ? 'success' : 'error'}`}>
//             {refreshStatus.message}
//           </div>
//         )}

//         {/* Success Notification Toast */}
//         {switchNotification.show && (
//           <div className="switch-notification">
//             <span>✅</span>
//             <span>{switchNotification.message}</span>
//           </div>
//         )}

//         {/* Confirmation Dialog */}
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

//         {/* Loading Overlay for Service Switching */}
//         {switchingService && (
//           <div className="service-switching-overlay">
//             <div className="service-switching-content">
//               <div className="switching-spinner"></div>
//               <p>{loadingMessage}</p>
//               <div className="switching-progress-bar">
//                 <div className="switching-progress-fill"></div>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Header: Service Dropdown + Power Button Row */}
//         <div className="header-controls-row">
//           {/* Service Dropdown */}
//           <div className="service-dropdown-wrapper">
//             <div className="service-dropdown-container" style={{ position: "relative" }}>
//               <div
//                 className="service-dropdown-header"
//                 onClick={() => setShowServiceDropdown(!showServiceDropdown)}
//                 style={{ position: "relative", cursor: "pointer" }}
//               >
//                 <span>
//                   {selectedService ? selectedService.service_item_name : "Select Service"}
//                 </span>

//                 {/* Global Alarm Badge */}
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
//                     const displayName = serviceItemsList.find(i => i.service_item_id === item.service_item)?.service_item_name || item.service_item;
//                     return (
//                       <div
//                         key={item.service_item}
//                         className="service-dropdown-item"
//                         onClick={() => {
//                           const fullItem = serviceItemsList.find(i => i.service_item_id === item.service_item);
//                           handleServiceSelect(fullItem || { service_item_id: item.service_item, service_item_name: displayName });
//                         }}
//                       >
//                         {displayName}
//                       </div>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Power Button */}
//           <div style={{ position: "relative" }}>
//             <button
//               className={`screen1-power-button ${processing.status ? "processing" : ""}`}
//               onClick={handlePowerToggle}
//               disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
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
//                 cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
//                 fontWeight: "bold",
//                 opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//               }}
//             >
//               <FiPower size={24} color="#fff" />
//               {processing.status && <span className="screen1-processing-indicator"></span>}
//             </button>
//             {sensorData.errorFlag == "1" && <div className="error-indicator" />}
//           </div>
//         </div>

//         {/* Logo below the row */}
//         <div className="logo-container">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
//         </div>

      
//         {/* Temperature Dial — dimmed when offline */}
//         <div style={{ pointerEvents: "none", opacity: sensorData.isOnline ? 1 : 0.35 }}>
//           <TemperatureDial
//             sensorData={sensorData}
//             onTempChange={handleTempChange}
//             fanSpeed={fanPosition}
//             initialTemperature={sensorData.temperature ?? 25}
//           />
//         </div>
//           {/* Offline banner between header and temperature dial */}
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

//         {/* Status messages */}
//         {processing.status && (
//           <div className="screen1-processing-message">{processing.message}</div>
//         )}

//         {sensorData.errorFlag == "1" && (
//           <div className="screen1-error-message">⚠️ System Error Detected</div>
//         )}

//         {sensorData.hvacBusy == "1" && !processing.status && (
//           <div className="screen1-busy-message">⏳ System is currently busy</div>
//         )}

//         {!serviceItemPermissions?.can_control_equipment && (
//           <div className="warning-message">⚠️ Control permissions not available</div>
//         )}


//         {/* Environment Info */}
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
//         {/* ==================== MODES SECTION ==================== */}
//         <div className="modes-section-in-footer">
//           <h3 className="modes-heading">Modes</h3>
//           <div className="modes-row">
//             {Object.values(MODE_MAP).map((mode) => (
//               <button
//                 key={mode}
//                 onClick={() => {
//                   console.log("🖱️ Mode button clicked in footer:", mode);
//                   handleModeChange(mode);
//                 }}
//                 className={`modes-button ${
//                   currentModeDescription === mode ? "modes-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* ==================== FAN SPEED SECTION (BUTTONS STYLE) ==================== */}
//         <div className="fan-speed-section-in-footer">
//           <h3 className="fan-speed-heading">Fan Speed</h3>
//           <div className="fan-speed-buttons-row">
//             {FAN_LABELS.map((label, index) => (
//               <button
//                 key={label}
//                 onClick={() => {
//                   console.log(`🖱️ Fan speed button clicked in footer: ${label} (index: ${index})`);
//                   handleFanClick(index);
//                 }}
//                 className={`fan-speed-button ${
//                   fanPosition === index ? "fan-speed-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* Control Buttons */}
//         <div className="control-buttons">
//           <button
//             className={`control-btn ${!hasValidPCBSerial ? 'screen1-disabled-btn' : ''}`}
//             disabled={!hasValidPCBSerial || !serviceItemPermissions?.can_control_equipment}
//             title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
//           >
//             <FiWind size={20} />
//             <span>Modes</span>
//             <span><strong>{getModeDescription(sensorData.mode)}</strong></span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🔔 Alarms button clicked. Error count:", errorCount);
//               navigate("/Delegate-alarms", {
//                 state: {
//                   alarmData: {
//                     alarmOccurred: sensorData.alarmOccurred,
//                     errorCount: errorCount,
//                     deviceId: sensorData.deviceId,
//                   },
//                   userId: userId,
//                   company_id: company_id
//                 },
//               });
//             }}
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

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("⏰ Timers button clicked");
//               handleNavigation("/timers");
//             }}
//             disabled={!serviceItemPermissions?.can_control_equipment}
//           >
//             <FiWatch size={20} />
//             <span>Timers</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("⚙️ Settings button clicked");
//               handleNavigation("/settings");
//             }}
//           >
//             <FiSettings size={20} />
//             <span>Settings</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🛠️ Services button clicked - navigating to delegate-home");
//               handleNavigation("/delegate-home");
//             }}
//           >
//             <FiZap size={20} />
//             <span>Services</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🚪 Logout button clicked");
//               handleLogout();
//             }}
//           >
//             <FiLogOut size={20} />
//             <span>Logout</span>
//           </button>
//         </div>

//         <div className="footer-logo">
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default DelegateScreen1;



// import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
// import axios from "axios";
// import {
//   FiArrowLeft,
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
// import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
// import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
// import { useNavigate } from "react-router-dom"; 
// import { AuthContext } from "../../Components/AuthContext/AuthContext";
// import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";
// import baseURL from "../../Components/ApiUrl/Apiurl";
// import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
// import './DelegateMachineScreens.css'

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

// const FAN_SPEEDS = ["0", "1", "2"]; // 0=High, 1=Medium, 2=Low
// const FAN_LABELS = ["High", "Medium", "Low"];

// // Pull-to-refresh configuration
// const PULL_THRESHOLD = 80;
// const MAX_PULL = 120;

// // Progressive messages every 10s
// const PROCESSING_MESSAGES = [
//   "1/6 Sending request...",
//   "2/6 Connecting to device...",
//   "3/6 Applying changes...",
//   "4/6 Syncing settings...",
//   "5/6 Confirming status...",
//   "6/6 Finalizing...", 
// ];

// // Service switching loading messages
// const SWITCHING_MESSAGES = [
//   "Connecting to device...",
//   "Fetching data from PCB...",
//   "Processing device information...",
//   "Updating system status...",
//   "Finalizing connection...",
//   "Connected successfully!",
// ];

// // Helper functions
// const formatTemp = (temp) => {
//   if (temp == null) return "0.0";
//   const num = parseFloat(temp);
//   return isNaN(num) ? "0.0" : num.toFixed(1);
// };

// // Function to send HVAC=3 command
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

// const DelegateScreen1 = () => {
//   const { user, logout } = useContext(AuthContext);
//   const { 
//     selectedServiceItem,
//     getSelectedServiceDetails,
//     serviceItemPermissions,
//     serviceItems,
//     updateSelectedServiceItem,
//     loading: serviceItemsLoading 
//   } = useDelegateServiceItems();
  
//   const userId = user?.delegate_id;
//   const company_id = user?.company_id;
//   const navigate = useNavigate();

//   const [showTempConfirmDialog, setShowTempConfirmDialog] = useState(false);
//   const [pendingTemperature, setPendingTemperature] = useState(null);

//   // Refs
//   const activePCBRef = useRef(null);
//   const fetchIntervalRef = useRef(null);
//   const processingTimerRef = useRef(null);
//   const processingMsgIndexRef = useRef(0);
//   const hardStopTimerRef = useRef(null);
//   const processingStartTimeRef = useRef(null);
//   const touchStartY = useRef(0);
//   const containerRef = useRef(null);

//   // Pull-to-refresh state
//   const [pullToRefresh, setPullToRefresh] = useState({
//     isPulling: false,
//     pullDistance: 0,
//     isRefreshing: false,
//   });
  
//   // State management
//   const [selectedService, setSelectedService] = useState(null);
//   const [showServiceDropdown, setShowServiceDropdown] = useState(false);
//   const [processing, setProcessing] = useState({ status: false, message: "" });
//   const [errorCount, setErrorCount] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [serviceItemsList, setServiceItemsList] = useState([]);
//   const [manualRefresh, setManualRefresh] = useState(false);
//   const [refreshStatus, setRefreshStatus] = useState({ 
//     sending: false, 
//     success: false, 
//     message: "" 
//   });
//   const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  
//   // Service switching states
//   const [showConfirmDialog, setShowConfirmDialog] = useState(false);
//   const [pendingService, setPendingService] = useState(null);
//   const [switchingService, setSwitchingService] = useState(false);
//   const [loadingMessage, setLoadingMessage] = useState("");
//   const [switchNotification, setSwitchNotification] = useState({ show: false, message: "" });
//   const [switchingProgress, setSwitchingProgress] = useState(0);
  
//   // Temperature dragging state
//   const [isDraggingTemp, setIsDraggingTemp] = useState(false);
  
//   // ✅ NEW: Track initial data load
//   const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  
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

//   // Display data for local changes
//   const [displayData, setDisplayData] = useState({
//     fanSpeed: "0",
//     temperature: 25,
//     mode: "3",
//     powerStatus: "off",
//   });

//   // Sync displayData with sensorData
//   useEffect(() => {
//     setDisplayData({
//       fanSpeed: sensorData.fanSpeed,
//       temperature: sensorData.temperature,
//       mode: sensorData.mode,
//       powerStatus: sensorData.powerStatus,
//     });
//   }, [sensorData]);

//   // Check if selected service has PCB serial number
//   const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;
  
//   // Get current mode description
//   const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
  
//   // Get fan position
//   const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

//   // ==================== API FUNCTIONS ====================
  
//   /**
//    * Fetches data for a specific PCB serial number
//    * Endpoint: /get-latest-data/{pcb_serial_number}/
//    * Used when switching to a new service to get that device's data
//    */
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

//   // Send temperature command to device
//   const sendTemperatureCommand = async (temperature) => {
//     console.group("🌡️ TEMPERATURE COMMAND SENT");
//     console.log("📱 Temperature changed to:", temperature);
//     console.log("💻 Current display data:", {
//       mode: displayData.mode,
//       fanSpeed: displayData.fanSpeed,
//       powerStatus: displayData.powerStatus
//     });
    
//     try {
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(displayData.mode) || 3,
//         FS: parseInt(displayData.fanSpeed) || 0,
//         SRT: parseInt(temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Temperature command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Temperature command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send temperature command");
//       }
      
//       console.log("✅ Temperature command sent successfully:", temperature);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending temperature command:", error);
//       console.groupEnd();
//     }
//   };

//   // ==================== UI HANDLERS ====================

//   // Handle temperature change during drag
//   const handleTempChange = (newTemp) => {
//     console.log("🌡️ Temperature changing (drag):", newTemp);
    
//     setDisplayData((prev) => ({ ...prev, temperature: newTemp }));
//     setIsDraggingTemp(true);
    
//     if (displayData.powerStatus === "off") {
//       console.log(`Temperature set to ${newTemp}°C locally (will apply when power turns on)`);
//     }
//   };

//   // Handle when user finishes dragging temperature
//   const handleTempChangeEnd = useCallback((newTemp) => {
//     console.log("🌡️ Temperature drag ended:", newTemp);
//     setIsDraggingTemp(false);

//     if (displayData.powerStatus === "off") {
//       console.log("💤 Power is OFF - Temperature saved locally");
//       return;
//     }

//     if (!serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ No control permissions - Temperature change not sent to device");
//       return;
//     }

//     setPendingTemperature(newTemp);
//     setShowTempConfirmDialog(true);
//   }, [displayData.powerStatus, serviceItemPermissions]);

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

//   // ==================== DATA FETCHING ====================

//   // Fetch service items with names from API
//   useEffect(() => {
//     if (user?.company_id && user?.delegate_id) {
//       axios.get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
//         .then((response) => {
//           try {
//             const data = Array.isArray(response.data) ? response.data : 
//                         (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
//             setServiceItemsList(data);
//           } catch (error) {
//             console.error('Error processing service items data:', error);
//             setServiceItemsList([]);
//           }
//         })
//         .catch((error) => {
//           console.error('Error fetching service items:', error);
//           setServiceItemsList([]);
//         });
//     }
//   }, [user?.company_id, user?.delegate_id]);

//   // ✅ MODIFIED: Initialize with data fetching - only runs once on mount
//   useEffect(() => {
//     const initialize = async () => {
//       try {
//         // Wait for service items to be loaded from context
//         if (serviceItemsLoading) return;
        
//         // Get the selected service details
//         const serviceDetails = getSelectedServiceDetails();
//         console.log("Selected Service Details:", serviceDetails);
        
//         if (serviceDetails?.pcb_serial_number) {
//           setSelectedService(serviceDetails);
//           activePCBRef.current = serviceDetails.pcb_serial_number;
          
//           // Fetch data for the selected service
//           setLoadingMessage("Loading device data...");
//           const deviceData = await fetchDataForPCB(serviceDetails.pcb_serial_number);
          
//           if (deviceData) {
//             // Update sensor data with real values
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
//               deviceId: serviceDetails.pcb_serial_number,
//               alarmOccurred: deviceData.alarm_occurred?.value || "0",
//               isOnline: isOnline,
//             });

//             // Update display data
//             setDisplayData({
//               fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
//               temperature: isOnline ? deviceData.set_temperature?.value : 25,
//               mode: deviceData.mode?.value || "3",
//               powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
//             });

//             // Update error count
//             const alarmValue = deviceData.alarm_occurred?.value;
//             setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
//           }
          
//           setInitialDataLoaded(true); // ✅ Mark initial data as loaded
//         } else {
//           // No PCB serial number, just mark as loaded
//           setInitialDataLoaded(true);
//         }
        
//         setLoading(false);
//         setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//         setManualRefresh(false);
        
//       } catch (error) {
//         console.error("❌ Error during initialization:", error);
//         setLoading(false);
//         setInitialDataLoaded(true);
//         setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//         setManualRefresh(false);
//       }
//     };

//     // Only run initialization once when the component mounts and service items are loaded
//     if (!initialDataLoaded && !serviceItemsLoading) {
//       initialize();
//     }
//   }, [serviceItemsLoading]); // ✅ Only depend on serviceItemsLoading

//   // Fetch all alarms for dropdown badge
//   const fetchAllAlarms = async () => {
//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Failed to fetch alarms");

//       const data = await response.json();

//       if (data.status !== "success" || !data.data) return;

//       const alarmCount = data.data.reduce((count, item) => {
//         const val = item.alarm_occurred?.value;
//         if (val && val !== "0") {
//           return count + Number(val);
//         }
//         return count;
//       }, 0);

//       setDropdownAlarmCount(alarmCount);
//     } catch (err) {
//       console.error("Alarm fetch error:", err);
//     }
//   };

//   // Fetch sensor data for active PCB
//   const fetchData = async () => {
//     const pcbSerialNumber = activePCBRef.current;
//     if (!pcbSerialNumber) return;

//     try {
//       const response = await fetch(
//         `${baseURL}/get-latest-data/${pcbSerialNumber}/?user_id=${userId}&company_id=${company_id}`
//       );

//       if (!response.ok) throw new Error("Network response was not ok");

//       const data = await response.json();

//       if (data?.status !== "success" || !data?.data) return;
//       if (activePCBRef.current !== pcbSerialNumber) return;

//       const deviceData = data.data;
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
//         deviceId: pcbSerialNumber,
//         alarmOccurred: deviceData.alarm_occurred?.value || "0",
//         isOnline: isOnline,
//       });

//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);

//       if (deviceData.hvac_busy?.value == "0") {
//         clearProcessingIfDone();
//       }
//     } catch (error) {
//       console.error("🔥 Fetch Error:", error);
//       setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
//       setManualRefresh(false);
//     }
//   };

//   // ✅ MODIFIED: Start polling only after initial data is loaded
//   useEffect(() => {
//     if (!initialDataLoaded || !activePCBRef.current) return;

//     if (fetchIntervalRef.current) {
//       clearInterval(fetchIntervalRef.current);
//       fetchIntervalRef.current = null;
//     }

//     fetchData();
//     fetchAllAlarms();

//     fetchIntervalRef.current = setInterval(() => {
//       fetchData();
//       fetchAllAlarms();
//     }, 120000);

//     return () => {
//       if (fetchIntervalRef.current) {
//         clearInterval(fetchIntervalRef.current);
//         fetchIntervalRef.current = null;
//       }
//     };
//   }, [initialDataLoaded, activePCBRef.current]);

//   // Update active PCB ref when selected service changes
//   useEffect(() => {
//     if (selectedService?.pcb_serial_number) {
//       console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
//       activePCBRef.current = selectedService.pcb_serial_number;
//     }
//   }, [selectedService?.pcb_serial_number]);

//   // ==================== COMMAND FUNCTIONS ====================

//   // Processing message cycle functions
//   const MIN_PROCESSING_TIME = 5000;
  
//   const startProcessingCycle = () => {
//     processingMsgIndexRef.current = 0;
//     processingStartTimeRef.current = Date.now();
//     setProcessing({ status: true, message: PROCESSING_MESSAGES[0] });

//     processingTimerRef.current = setInterval(() => {
//       processingMsgIndexRef.current += 1;
//       const nextMsg = PROCESSING_MESSAGES[processingMsgIndexRef.current];
//       if (nextMsg) {
//         setProcessing({ status: true, message: nextMsg });
//       }
//     }, 10000);

//     hardStopTimerRef.current = setTimeout(() => {
//       stopProcessing();
//     }, 60000);
//   };

//   const stopProcessing = () => {
//     if (processingTimerRef.current) {
//       clearInterval(processingTimerRef.current);
//       processingTimerRef.current = null;
//     }
//     if (hardStopTimerRef.current) {
//       clearTimeout(hardStopTimerRef.current);
//       hardStopTimerRef.current = null;
//     }
//     setProcessing({ status: false, message: "" });
//   };

//   const clearProcessingIfDone = () => {
//     if (processingTimerRef.current || hardStopTimerRef.current) {
//       const elapsed = Date.now() - (processingStartTimeRef.current || 0);
//       if (elapsed >= MIN_PROCESSING_TIME) {
//         stopProcessing();
//       }
//     }
//   };

//   // Cleanup timers
//   useEffect(() => {
//     return () => {
//       if (processingTimerRef.current) clearInterval(processingTimerRef.current);
//       if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
//     };
//   }, []);

//   // Send mode command
//   const sendModeCommand = async (modeCode, modeName) => {
//     console.group("🎛️ MODE COMMAND SENT");
//     console.log("📱 Mode clicked:", modeName);
//     console.log("🔢 Mode code:", modeCode);
    
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(modeCode) || 3,
//         FS: parseInt(displayData.fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Mode command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Mode command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }
      
//       console.log("✅ Mode command sent successfully:", modeName);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending mode command:", error);
//       console.groupEnd();
//       stopProcessing();
//     }
//   };

//   // Send fan command
//   const sendFanCommand = async (fanSpeed) => {
//     const fanSpeedLabel = FAN_LABELS[parseInt(fanSpeed)] || fanSpeed;
//     console.group("🌀 FAN SPEED COMMAND SENT");
//     console.log("📱 Fan speed clicked:", fanSpeedLabel);
//     console.log("🔢 Fan speed code:", fanSpeed);
    
//     try {
//       startProcessingCycle();
      
//       const payload = {
//         Header: "0xAA",
//         DI: selectedService?.pcb_serial_number || "2411GM-0102",
//         MD: parseInt(displayData.mode) || 3,
//         FS: parseInt(fanSpeed) || 0,
//         SRT: parseInt(displayData.temperature) || 25,
//         HVAC: displayData.powerStatus === "on" ? "1" : "0",
//         Footer: "0xZX",
//       };
      
//       console.log("📦 Fan command payload:", payload);
      
//       const response = await fetch("https://mdata.air2o.net/controllers/", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
      
//       if (!response.ok) {
//         console.error("❌ Fan command failed with status:", response.status);
//         stopProcessing();
//         throw new Error("Failed to send command");
//       }
      
//       console.log("✅ Fan command sent successfully:", fanSpeedLabel);
//       console.groupEnd();
//     } catch (error) {
//       console.error("❌ Error sending fan command:", error);
//       console.groupEnd();
//       stopProcessing();
//     }
//   };

//   // Handle mode change
//   const handleModeChange = async (newMode) => {
//     console.log("🔘 Mode button clicked:", newMode);
    
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ Mode change blocked - Conditions not met");
//       return;
//     }
    
//     const newModeCode = MODE_CODE_MAP[newMode] || 1;
//     setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
//     if (displayData.powerStatus === "on") {
//       await sendModeCommand(newModeCode.toString(), newMode);
//     } else {
//       console.log("💤 Power is OFF - Mode saved locally");
//     }
//   };

//   // Handle fan speed change
//   const handleFanSpeedChange = async (newPosition) => {
//     const newSpeed = FAN_SPEEDS[newPosition];
//     const newSpeedLabel = FAN_LABELS[newPosition];
    
//     console.log("🌀 Fan speed button clicked:", newSpeedLabel);
    
//     if (processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment) {
//       console.log("⚠️ Fan change blocked - Conditions not met");
//       return;
//     }
    
//     setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));
    
//     if (displayData.powerStatus === "on") {
//       await sendFanCommand(newSpeed);
//     } else {
//       console.log(`💤 Power is OFF - Fan speed set to ${newSpeedLabel} (will apply when power turns on)`);
//     }
//   };

//   // Handle fan click on button
//   const handleFanClick = (index) => {
//     console.log("🖱️ Fan button clicked at index:", index, "Label:", FAN_LABELS[index]);
//     handleFanSpeedChange(index);
//   };

//   // Send refresh to controller
//   const sendRefreshToController = async () => {
//     if (!selectedService?.pcb_serial_number) {
//       setRefreshStatus({ sending: false, success: false, message: "No device selected" });
//       return { success: false };
//     }

//     if (!serviceItemPermissions?.can_control_equipment) {
//       setRefreshStatus({ sending: false, success: false, message: "Control permissions not available" });
//       return { success: false };
//     }

//     try {
//       const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
      
//       if (result?.success) {
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

//   // Handle power toggle
//   const handlePowerToggle = async () => {
//     console.log("🔘 Power button clicked. Current status:", sensorData.powerStatus);
    
//     if (!selectedService?.pcb_serial_number) {
//       console.log("❌ No PCB serial number available");
//       return;
//     }
    
//     if (processing.status || sensorData.hvacBusy == "1" || !serviceItemPermissions?.can_control_equipment) {
//       const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
//       console.log("⚠️ Power toggle blocked:", msg);
//       setProcessing({ status: true, message: msg });
//       return;
//     }

//     startProcessingCycle();

//     const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
//     const isShutdown = displayData?.fanSpeed == 3 || displayData?.mode == 0;
    
//     console.log("⚡ Sending power command. New HVAC value:", newHvacValue);

//     const payload = {
//       Header: "0xAA",
//       DI: selectedService.pcb_serial_number,
//       MD: isShutdown ? "3" : displayData.mode,
//       FS: isShutdown ? "0" : displayData.fanSpeed,
//       SRT: displayData.temperature,
//       HVAC: newHvacValue,
//       Footer: "0xZX",
//     };

//     try {
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
//       console.log("✅ Power command sent:", result);
//     } catch (error) {
//       console.error("Error sending power command:", error);
//       stopProcessing();
//     }
//   };

//   // ==================== SERVICE SWITCHING ====================

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
//       // Message 1: Connecting
//       setLoadingMessage(SWITCHING_MESSAGES[0]);
//       setSwitchingProgress(10);
//       await new Promise(resolve => setTimeout(resolve, 500));
      
//       // Update the active PCB reference
//       activePCBRef.current = pendingService.pcb_serial_number;
      
//       // Message 2: Fetching data from the specific PCB
//       setLoadingMessage(SWITCHING_MESSAGES[1]);
//       setSwitchingProgress(30);
//       await new Promise(resolve => setTimeout(resolve, 500));
      
//       // Fetch data for the specific PCB using the single device endpoint
//       const deviceData = await fetchDataForPCB(pendingService.pcb_serial_number);
      
//       if (!deviceData) {
//         setLoadingMessage("Connected but no data available");
//         setSwitchingProgress(70);
//         await new Promise(resolve => setTimeout(resolve, 500));
        
//         setSelectedService(pendingService);
//         activePCBRef.current = pendingService.pcb_serial_number;
//         updateSelectedServiceItem(pendingService.service_item_id);
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
      
//       // Message 3: Processing
//       setLoadingMessage(SWITCHING_MESSAGES[2]);
//       setSwitchingProgress(50);
//       await new Promise(resolve => setTimeout(resolve, 500));
      
//       // Update all state with the new device data
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
      
//       // Update display data
//       setDisplayData({
//         fanSpeed: isOnline ? deviceData.fan_speed?.value : "0",
//         temperature: isOnline ? deviceData.set_temperature?.value : 25,
//         mode: deviceData.mode?.value || "3",
//         powerStatus: isOnline && deviceData.hvac_on?.value == "1" ? "on" : "off",
//       });
      
//       // Message 4: Updating
//       setLoadingMessage(SWITCHING_MESSAGES[3]);
//       setSwitchingProgress(70);
//       await new Promise(resolve => setTimeout(resolve, 500));
      
//       // Update error count
//       const alarmValue = deviceData.alarm_occurred?.value;
//       setErrorCount(alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0);
      
//       // Message 5: Finalizing
//       setLoadingMessage(SWITCHING_MESSAGES[4]);
//       setSwitchingProgress(85);
//       await new Promise(resolve => setTimeout(resolve, 500));
      
//       // Finally update the selected service
//       setSelectedService(pendingService);
//       activePCBRef.current = pendingService.pcb_serial_number;
//       updateSelectedServiceItem(pendingService.service_item_id);
      
//       // Message 6: Complete
//       setLoadingMessage(SWITCHING_MESSAGES[5]);
//       setSwitchingProgress(100);
//       await new Promise(resolve => setTimeout(resolve, 500));
      
//       setSwitchingService(false);
//       setLoadingMessage("");
      
//       // Show success notification
//       setSwitchNotification({ 
//         show: true, 
//         message: `✅ Successfully switched to ${pendingService.service_item_name}` 
//       });
      
//       setTimeout(() => {
//         setSwitchNotification({ show: false, message: "" });
//       }, 3000);
      
//     } catch (error) {
//       console.error("❌ Error switching service:", error);
//       setSwitchingService(false);
//       setLoadingMessage("");
      
//       setSelectedService(pendingService);
//       activePCBRef.current = pendingService.pcb_serial_number;
//       updateSelectedServiceItem(pendingService.service_item_id);
      
//       setSwitchNotification({ 
//         show: true, 
//         message: `⚠️ Switched to ${pendingService.service_item_name}` 
//       });
      
//       setTimeout(() => {
//         setSwitchNotification({ show: false, message: "" });
//       }, 3000);
//     }
//   };

//   // Cancel service switch
//   const cancelServiceSwitch = () => {
//     setShowConfirmDialog(false);
//     setPendingService(null);
//   };

//   // ==================== NAVIGATION & UI HANDLERS ====================

//   const handleNavigation = (path) => {
//     if (!processing.status) {
//       console.log("🧭 Navigating to:", path);
//       navigate(path);
//     } else {
//       console.log("⚠️ Navigation blocked - command in progress");
//     }
//   };

//   // Pull-to-refresh handlers
//   const handleTouchStart = (e) => {
//     touchStartY.current = e.touches[0].clientY;
//   };

//   const handleTouchMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.touches[0].clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleTouchEnd = async () => {
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleMouseDown = (e) => {
//     touchStartY.current = e.clientY;
//     document.addEventListener("mousemove", handleMouseMove);
//     document.addEventListener("mouseup", handleMouseUp);
//   };

//   const handleMouseMove = (e) => {
//     if (containerRef.current && containerRef.current.scrollTop > 0) return;
    
//     const pullDistance = e.clientY - touchStartY.current;
//     if (pullDistance > 0) {
//       e.preventDefault();
//       setPullToRefresh({
//         isPulling: true,
//         pullDistance: Math.min(pullDistance, MAX_PULL),
//         isRefreshing: false,
//       });
//     }
//   };

//   const handleMouseUp = async () => {
//     document.removeEventListener("mousemove", handleMouseMove);
//     document.removeEventListener("mouseup", handleMouseUp);
    
//     if (pullToRefresh.pullDistance >= PULL_THRESHOLD && !pullToRefresh.isRefreshing) {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: true });
//       await sendRefreshToController();
//       setManualRefresh(true);
//     } else {
//       setPullToRefresh({ isPulling: false, pullDistance: 0, isRefreshing: false });
//     }
//   };

//   const handleLogout = () => {
//     console.log("🚪 User logging out");
//     logout();
//     navigate("/");
//   };

//   const getModeDescription = (code) => MODE_MAP[code] || "Fan";

//   const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
//   const indicatorRotation = pullProgress * 360;
//   const indicatorOpacity = pullProgress;

//   // ✅ MODIFIED: Loading states - only show initial loading if not loaded yet
//   if (serviceItemsLoading || (loading && !initialDataLoaded)) {
//     return (
//       <div
//         className="mainmain-container"
//         style={{
//           backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//           minHeight: "100vh",
//           display: "flex",
//           justifyContent: "center",
//           alignItems: "center",
//           flexDirection: "column",
//           color: "white",
//         }}
//       >
//         <div style={{ color: "white", fontSize: "18px", marginBottom: "10px" }}>
//           {loadingMessage || "Loading..."}
//         </div>
//         <div style={{ 
//           width: "40px", 
//           height: "40px", 
//           border: "4px solid rgba(255,255,255,0.3)",
//           borderTop: "4px solid white",
//           borderRadius: "50%",
//           animation: "spin 1s linear infinite"
//         }} />
//         <button
//           onClick={handleLogout}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "8px",
//             backgroundColor: "rgba(255, 255, 255, 0.15)",
//             color: "white",
//             border: "1px solid white",
//             borderRadius: "8px",
//             padding: "8px 16px",
//             cursor: "pointer",
//             fontSize: "16px",
//             marginTop: "20px",
//           }}
//         >
//           <FiLogOut size={20} />
//           <span>Logout</span>
//         </button>
//         <style>{`
//           @keyframes spin {
//             0% { transform: rotate(0deg); }
//             100% { transform: rotate(360deg); }
//           }
//         `}</style>
//       </div>
//     );
//   }

//   // No service items case
//   if (!serviceItemsLoading && serviceItems.length === 0 && initialDataLoaded) {
//     return (
//       <div className="mainmain-container" style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         minHeight: "100vh",
//         display: "flex",
//         flexDirection: "column",
//         justifyContent: "center",
//         alignItems: "center",
//         padding: "20px",
//         textAlign: "center"
//       }}>
//         <div className="logo">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" style={{ marginBottom: "20px" }} />
//         </div>
        
//         <div style={{
//           backgroundColor: "rgba(255, 255, 255, 0.1)",
//           padding: "40px",
//           borderRadius: "12px",
//           maxWidth: "500px",
//           width: "100%"
//         }}>
//           <h2 style={{ color: "white", marginBottom: "20px", fontSize: "24px" }}>
//             No Machines Assigned
//           </h2>
//           <p style={{ color: "white", marginBottom: "30px", fontSize: "16px", lineHeight: "1.5" }}>
//             You don't have any machines assigned to your account yet.
//           </p>
          
//           <button
//             onClick={handleLogout}
//             style={{
//               padding: "12px 24px",
//               backgroundColor: "rgba(255, 255, 255, 0.2)",
//               color: "white",
//               border: "1px solid rgba(255, 255, 255, 0.3)",
//               borderRadius: "6px",
//               cursor: "pointer",
//               fontSize: "16px",
//               display: "flex",
//               alignItems: "center",
//               gap: "8px",
//               margin: "0 auto"
//             }}
//           >
//             <FiLogOut size={18} />
//             Logout
//           </button>
//         </div>
        
//         <div className="footer-logo" style={{ marginTop: "40px" }}>
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div 
//       className="mainmain-container" 
//       style={{
//         backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
//         touchAction: "pan-y",
//       }}
//       ref={containerRef}
//       onTouchStart={handleTouchStart}
//       onTouchMove={handleTouchMove}
//       onTouchEnd={handleTouchEnd}
//       onMouseDown={handleMouseDown}
//     >
//       {/* Pull-to-refresh indicator */}
//       <div 
//         className="screen1-pull-refresh"
//         style={{
//           height: `${pullToRefresh.pullDistance}px`,
//           opacity: pullToRefresh.isPulling || pullToRefresh.isRefreshing ? 1 : 0,
//           transform: `translateY(${pullToRefresh.isPulling ? 0 : -30}px)`,
//           transition: pullToRefresh.isPulling ? 'none' : 'all 0.3s ease',
//         }}
//       >
//         <div className="screen1-refresh-content">
//           {pullToRefresh.isRefreshing ? (
//             <>
//               <div className="screen1-refresh-spinner"></div>
//               <span>Sending refresh command...</span>
//             </>
//           ) : (
//             <>
//               <FiRefreshCw 
//                 size={24} 
//                 style={{
//                   transform: `rotate(${indicatorRotation}deg)`,
//                   transition: 'transform 0.2s ease',
//                   opacity: indicatorOpacity,
//                 }}
//               />
//               <span>
//                 {pullToRefresh.pullDistance >= PULL_THRESHOLD 
//                   ? "Release to refresh" 
//                   : "Pull down to refresh"}
//               </span>
//             </>
//           )}
//         </div>
//       </div>

//       <div className="main-container">
//         {/* Refresh status toast */}
//         {refreshStatus.message && (
//           <div className={`screen1-refresh-status ${refreshStatus.success ? 'success' : 'error'}`}>
//             {refreshStatus.message}
//           </div>
//         )}

//         {/* Success Notification Toast */}
//         {switchNotification.show && (
//           <div className="switch-notification">
//             <span>✅</span>
//             <span>{switchNotification.message}</span>
//           </div>
//         )}

//         {/* Confirmation Dialog */}
//         {showConfirmDialog && (
//           <div className="confirm-dialog-overlay">
//             <div className="confirm-dialog">
//               <div className="confirm-dialog-content">
//                 <h3>Switch Service?</h3>
//                 <p>Are you sure you want to switch to <strong>{pendingService?.service_item_name}</strong>?</p>
//                 <p style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
//                   PCB: {pendingService?.pcb_serial_number}
//                 </p>
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

//         {/* Temperature Change Confirmation Dialog */}
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

//         {/* Loading Overlay for Service Switching */}
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
//               <p className="switching-pcb-detail">
//                 PCB: {pendingService?.pcb_serial_number || 'N/A'}
//               </p>
//             </div>
//           </div>
//         )}

//         {/* Header: Service Dropdown + Power Button Row */}
//         <div className="header-controls-row">
//           {/* Service Dropdown */}
//           <div className="service-dropdown-wrapper">
//             <div className="service-dropdown-container" style={{ position: "relative" }}>
//               <div
//                 className="service-dropdown-header"
//                 onClick={() => setShowServiceDropdown(!showServiceDropdown)}
//                 style={{ position: "relative", cursor: "pointer" }}
//               >
//                 <span>
//                   {selectedService ? selectedService.service_item_name : "Select Service"}
//                 </span>

//                 {/* Global Alarm Badge */}
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
//                     const displayName = serviceItemsList.find(i => i.service_item_id === item.service_item)?.service_item_name || item.service_item;
//                     const fullItem = serviceItemsList.find(i => i.service_item_id === item.service_item);
//                     return (
//                       <div
//                         key={item.service_item}
//                         className={`service-dropdown-item ${
//                           selectedService?.service_item_id === item.service_item ? "active" : ""
//                         }`}
//                         onClick={() => {
//                           handleServiceSelect(fullItem || { 
//                             service_item_id: item.service_item, 
//                             service_item_name: displayName,
//                             pcb_serial_number: item.pcb_serial_number 
//                           });
//                         }}
//                       >
//                         {displayName}
//                         {selectedService?.service_item_id === item.service_item && (
//                           <span style={{ marginLeft: "8px", color: "#3E99ED" }}>✓</span>
//                         )}
//                       </div>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Power Button */}
//           <div style={{ position: "relative" }}>
//             <button
//               className={`screen1-power-button ${processing.status ? "processing" : ""}`}
//               onClick={handlePowerToggle}
//               disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
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
//                 cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
//                 fontWeight: "bold",
//                 opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//               }}
//             >
//               <FiPower size={24} color="#fff" />
//               {processing.status && <span className="screen1-processing-indicator"></span>}
//             </button>
//             {sensorData.errorFlag == "1" && <div className="error-indicator" />}
//           </div>
//         </div>

//         {/* Logo below the row */}
//         <div className="logo-container">
//           <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
//         </div>

//         {/* Temperature Dial */}
//         <div style={{ 
//           pointerEvents: sensorData.isOnline && !processing.status && serviceItemPermissions?.can_control_equipment ? "auto" : "none", 
//           opacity: sensorData.isOnline ? 1 : 0.35 
//         }}>
//           <TemperatureDial
//             onTempChange={handleTempChange}
//             onTempChangeEnd={handleTempChangeEnd}
//             fanSpeed={fanPosition}
//             initialTemperature={displayData.temperature ?? 25}
//             disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//           />
//         </div>
        
//         {/* Offline banner between header and temperature dial */}
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

//         {/* Status messages */}
//         {processing.status && (
//           <div className="screen1-processing-message">{processing.message}</div>
//         )}

//         {sensorData.errorFlag == "1" && (
//           <div className="screen1-error-message">⚠️ System Error Detected</div>
//         )}

//         {sensorData.hvacBusy == "1" && !processing.status && (
//           <div className="screen1-busy-message">⏳ System is currently busy</div>
//         )}

//         {!serviceItemPermissions?.can_control_equipment && (
//           <div className="warning-message">⚠️ Control permissions not available</div>
//         )}

//         {/* Environment Info */}
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
//         {/* Modes Section */}
//         <div className="modes-section-in-footer">
//           <h3 className="modes-heading">Modes</h3>
//           <div className="modes-row">
//             {Object.values(MODE_MAP).map((mode) => (
//               <button
//                 key={mode}
//                 onClick={() => {
//                   console.log("🖱️ Mode button clicked in footer:", mode);
//                   handleModeChange(mode);
//                 }}
//                 className={`modes-button ${
//                   currentModeDescription === mode ? "modes-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* Fan Speed Section */}
//         <div className="fan-speed-section-in-footer">
//           <h3 className="fan-speed-heading">Fan Speed</h3>
//           <div className="fan-speed-buttons-row">
//             {FAN_LABELS.map((label, index) => (
//               <button
//                 key={label}
//                 onClick={() => {
//                   console.log(`🖱️ Fan speed button clicked in footer: ${label} (index: ${index})`);
//                   handleFanClick(index);
//                 }}
//                 className={`fan-speed-button ${
//                   fanPosition === index ? "fan-speed-button-selected" : ""
//                 }`}
//                 disabled={processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment}
//                 style={{
//                   opacity: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? 0.6 : 1,
//                   cursor: processing.status || !sensorData.isOnline || !serviceItemPermissions?.can_control_equipment ? "not-allowed" : "pointer",
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

//         {/* Control Buttons */}
//         <div className="control-buttons">
//           <button
//             className={`control-btn ${!hasValidPCBSerial ? 'screen1-disabled-btn' : ''}`}
//             disabled={!hasValidPCBSerial || !serviceItemPermissions?.can_control_equipment}
//             title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
//           >
//             {/* <FiWind size={20} />
//             <span>Modes</span>
//             <span><strong>{getModeDescription(sensorData.mode)}</strong></span> */}
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🔔 Alarms button clicked. Error count:", errorCount);
//               navigate("/Delegate-alarms", {
//                 state: {
//                   alarmData: {
//                     alarmOccurred: sensorData.alarmOccurred,
//                     errorCount: errorCount,
//                     deviceId: sensorData.deviceId,
//                   },
//                   userId: userId,
//                   company_id: company_id
//                 },
//               });
//             }}
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

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("⏰ Timers button clicked");
//               handleNavigation("/timers");
//             }}
//             disabled={!serviceItemPermissions?.can_control_equipment}
//           >
//             <FiWatch size={20} />
//             <span>Timers</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("⚙️ Settings button clicked");
//               handleNavigation("/settings");
//             }}
//           >
//             <FiSettings size={20} />
//             <span>Settings</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🛠️ Services button clicked - navigating to delegate-home");
//               handleNavigation("/delegate-home");
//             }}
//           >
//             <FiZap size={20} />
//             <span>Services</span>
//           </button>

//           <button
//             className="control-btn"
//             onClick={() => {
//               console.log("🚪 Logout button clicked");
//               handleLogout();
//             }}
//           >
//             <FiLogOut size={20} />
//             <span>Logout</span>
//           </button>
//         </div>

//         <div className="footer-logo">
//           <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default DelegateScreen1;



import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import axios from "axios";
import {
  FiArrowLeft,
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
import AIROlogo from "../../Components/Screens/MachineScreensNew/Images/AIRO.png";
import greenAire from "../../Components/Screens/MachineScreensNew/Images/greenAire.png";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../Components/AuthContext/AuthContext";
import TemperatureDial from "../../Components/Screens/MachineScreensNew/TemperatureDial_delegate_screen";
import baseURL from "../../Components/ApiUrl/Apiurl";
import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
import './DelegateMachineScreens.css'

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

const FAN_SPEEDS = ["0", "1", "2"]; // 0=High, 1=Medium, 2=Low
const FAN_LABELS = ["High", "Medium", "Low"];

// Pull-to-refresh configuration
const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

// How long (ms) we trust a locally-sent value (temperature/fan speed) over what the poll returns.
// Gives the device time to actually apply the change before we let the poll overwrite it.
const VALUE_LOCK_DURATION = 60000;

// Progressive messages every 10s
const PROCESSING_MESSAGES = [
  "1/6 Sending request...",
  "2/6 Connecting to device...",
  "3/6 Applying changes...",
  "4/6 Syncing settings...",
  "5/6 Confirming status...",
  "6/6 Finalizing...",
];

// Service switching loading messages
const SWITCHING_MESSAGES = [
  "Connecting to device...",
  "Fetching data from Machine...",
  "Processing device information...",
  "Updating system status...",
  "Finalizing connection...",
  "Connected successfully!",
];

// Helper functions
const formatTemp = (temp) => {
  if (temp == null) return "0.0";
  const num = parseFloat(temp);
  return isNaN(num) ? "0.0" : num.toFixed(1);
};

// Function to send HVAC=3 command
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

// Helper function to get alarm count for a specific service item
const getAlarmCountForItem = (item, allDevicesData) => {
  if (!allDevicesData || !item) return 0;
  const deviceData = allDevicesData.find(d => d.service_item_id === item.service_item_id);
  if (!deviceData) return 0;
  const alarmValue = deviceData.alarm_occurred?.value;
  return alarmValue && alarmValue !== "0" ? Number(alarmValue) : 0;
};

const DelegateScreen1 = () => {
  const { user, logout } = useContext(AuthContext);
  const { 
    selectedServiceItem,
    getSelectedServiceDetails,
    serviceItemPermissions,
    serviceItems,
    updateSelectedServiceItem,
    loading: serviceItemsLoading 
  } = useDelegateServiceItems();
  
  const userId = user?.delegate_id;
  const company_id = user?.company_id;
  const navigate = useNavigate();

  const [showTempConfirmDialog, setShowTempConfirmDialog] = useState(false);
  const [pendingTemperature, setPendingTemperature] = useState(null);

  // Refs
  const activePCBRef = useRef(null);
  const fetchIntervalRef = useRef(null);
  const processingTimerRef = useRef(null);
  const processingMsgIndexRef = useRef(0);
  const hardStopTimerRef = useRef(null);
  const processingStartTimeRef = useRef(null);
  const touchStartY = useRef(0);
  const containerRef = useRef(null);
  const isFetchingRef = useRef(false); // ✅ NEW: blocks overlapping fetchData calls
  const hasStoppedRef = useRef(false); // ✅ NEW: prevents clearProcessingIfDone from firing stopProcessing more than once per cycle
  const processingPollRef = useRef(null); // ✅ NEW: fast poll while a command is processing
  const processingRef = useRef(false); // ✅ NEW: mirrors processing.status for use inside intervals/closures

  // ✅ NEW: tracks which action started the current processing cycle ('power' | 'mode')
  // so we only spin the power button icon for actual power on/off commands.
  const processingKindRef = useRef(null);

  // ✅ NEW: silently "lock" the temperature value we just sent so the next poll
  // doesn't overwrite it with a stale reading before the device has caught up.
  const pendingTempRef = useRef(null);
  const tempLockExpiryRef = useRef(0);

  // ✅ NEW: same lock treatment for fan speed
  const pendingFanRef = useRef(null);
  const fanLockExpiryRef = useRef(0);

  // Pull-to-refresh state
  const [pullToRefresh, setPullToRefresh] = useState({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  });
  
  // State management
  const [selectedService, setSelectedService] = useState(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [processing, setProcessing] = useState({ status: false, message: "" });
  const [errorCount, setErrorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [serviceItemsList, setServiceItemsList] = useState([]);
  const [manualRefresh, setManualRefresh] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState({ 
    sending: false, 
    success: false, 
    message: "" 
  });
  const [dropdownAlarmCount, setDropdownAlarmCount] = useState(0);
  const [allDevicesData, setAllDevicesData] = useState([]); // ✅ Store all devices data for individual alarm counts
  
  // Service switching states
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingService, setPendingService] = useState(null);
  const [switchingService, setSwitchingService] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [switchNotification, setSwitchNotification] = useState({ show: false, message: "" });
  const [switchingProgress, setSwitchingProgress] = useState(0);
  
  // Temperature dragging state
  const [isDraggingTemp, setIsDraggingTemp] = useState(false);
  
  // ✅ Track initial data load
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  
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

  // Display data for local changes
  const [displayData, setDisplayData] = useState({
    fanSpeed: "0",
    temperature: 25,
    mode: "3",
    powerStatus: "off",
  });

  // Sync displayData with sensorData
  useEffect(() => {
    setDisplayData({
      fanSpeed: sensorData.fanSpeed,
      temperature: sensorData.temperature,
      mode: sensorData.mode,
      powerStatus: sensorData.powerStatus,
    });
  }, [sensorData]);

  // ✅ NEW: keep processingRef in sync with processing.status so interval closures see the latest value
  useEffect(() => {
    processingRef.current = processing.status;
  }, [processing.status]);

  // Check if selected service has PCB serial number
  const hasValidPCBSerial = selectedService && selectedService.pcb_serial_number;
  
  // Get current mode description
  const currentModeDescription = MODE_MAP[displayData.mode] || "Fan";
  
  // Get fan position
  const fanPosition = FAN_SPEEDS.indexOf(displayData.fanSpeed);

  // ✅ NEW: single source of truth for whether controls should be disabled
  const isControlDisabled = () => {
    // Disable if processing is happening
    if (processing.status) return true;

    // Disable if device is offline
    if (!sensorData.isOnline) return true;

    // Disable if error flag is 1
    if (sensorData.errorFlag === "1") return true;

    // Disable if HVAC is busy
    if (sensorData.hvacBusy === "1") return true;

    // Disable if an alarm has occurred
    if (sensorData.alarmOccurred && sensorData.alarmOccurred !== "0") return true;

    // Disable if the delegate doesn't have control permissions
    if (!serviceItemPermissions?.can_control_equipment) return true;

    return false;
  };

  const hasActiveAlarm = sensorData.alarmOccurred && sensorData.alarmOccurred !== "0";

  // ==================== VALUE LOCK RESOLUTION ====================

  // ✅ NEW: Resolve what temperature to trust when a poll comes back.
  // If we recently sent a temperature change and are still inside the lock
  // window, keep showing the value we sent instead of the (possibly stale)
  // value the poll returned — unless the poll already confirms our value.
  const resolveTemperature = (deviceTempValue) => {
    const now = Date.now();
    if (pendingTempRef.current !== null && now < tempLockExpiryRef.current) {
      if (
        deviceTempValue !== undefined &&
        deviceTempValue !== null &&
        String(deviceTempValue) === String(pendingTempRef.current)
      ) {
        // Device has confirmed the new value — release the lock early.
        pendingTempRef.current = null;
        tempLockExpiryRef.current = 0;
        return deviceTempValue;
      }
      return pendingTempRef.current;
    }
    // Lock expired or never set — clear any stale pending value and trust the poll.
    pendingTempRef.current = null;
    return deviceTempValue;
  };

  // ✅ NEW: same lock-aware resolution for fan speed
  const resolveFanSpeed = (deviceFanValue) => {
    const now = Date.now();
    if (pendingFanRef.current !== null && now < fanLockExpiryRef.current) {
      if (
        deviceFanValue !== undefined &&
        deviceFanValue !== null &&
        String(deviceFanValue) === String(pendingFanRef.current)
      ) {
        // Device has confirmed the new fan speed — release the lock early.
        pendingFanRef.current = null;
        fanLockExpiryRef.current = 0;
        return deviceFanValue;
      }
      return pendingFanRef.current;
    }
    pendingFanRef.current = null;
    return deviceFanValue;
  };

  // ==================== API FUNCTIONS ====================
  
  /**
   * Fetches data for a specific PCB serial number
   * Endpoint: /get-latest-data/{pcb_serial_number}/
   * Used when switching to a new service to get that device's data
   */
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

  // Send temperature command to device
  const sendTemperatureCommand = async (temperature) => {
    console.group("🌡️ TEMPERATURE COMMAND SENT");
    console.log("📱 Temperature changed to:", temperature);
    console.log("💻 Current display data:", {
      mode: displayData.mode,
      fanSpeed: displayData.fanSpeed,
      powerStatus: displayData.powerStatus
    });
    
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
      
      console.log("📦 Temperature command payload:", payload);
      
      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        console.error("❌ Temperature command failed with status:", response.status);
        throw new Error("Failed to send temperature command");
      }
      
      console.log("✅ Temperature command sent successfully:", temperature);
      console.groupEnd();
    } catch (error) {
      console.error("❌ Error sending temperature command:", error);
      console.groupEnd();
    }
  };

  // ==================== UI HANDLERS ====================

  // Handle temperature change during drag
  const handleTempChange = (newTemp) => {
    console.log("🌡️ Temperature changing (drag):", newTemp);
    
    setDisplayData((prev) => ({ ...prev, temperature: newTemp }));
    setIsDraggingTemp(true);
    
    if (displayData.powerStatus === "off") {
      console.log(`Temperature set to ${newTemp}°C locally (will apply when power turns on)`);
    }
  };

  // Handle when user finishes dragging temperature
  const handleTempChangeEnd = useCallback((newTemp) => {
    console.log("🌡️ Temperature drag ended:", newTemp);
    setIsDraggingTemp(false);

    if (displayData.powerStatus === "off") {
      console.log("💤 Power is OFF - Temperature saved locally");
      return;
    }

    if (!serviceItemPermissions?.can_control_equipment) {
      console.log("⚠️ No control permissions - Temperature change not sent to device");
      return;
    }

    setPendingTemperature(newTemp);
    setShowTempConfirmDialog(true);
  }, [displayData.powerStatus, serviceItemPermissions]);

  const confirmTempChange = async () => {
    if (pendingTemperature === null) return;
    const tempToSend = pendingTemperature;

    setShowTempConfirmDialog(false);
    setPendingTemperature(null);

    // ✅ NEW: lock this value in so polls for the next 60s don't revert it
    pendingTempRef.current = tempToSend;
    tempLockExpiryRef.current = Date.now() + VALUE_LOCK_DURATION;

    await sendTemperatureCommand(tempToSend);
  };

  const cancelTempChange = () => {
    setShowTempConfirmDialog(false);
    setPendingTemperature(null);
    setDisplayData((prev) => ({ ...prev, temperature: sensorData.temperature }));
  };

  // ==================== DATA FETCHING ====================

  // Fetch service items with names from API
  useEffect(() => {
    if (user?.company_id && user?.delegate_id) {
      axios.get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
        .then((response) => {
          try {
            const data = Array.isArray(response.data) ? response.data : 
                        (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
            setServiceItemsList(data);
          } catch (error) {
            console.error('Error processing service items data:', error);
            setServiceItemsList([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching service items:', error);
          setServiceItemsList([]);
        });
    }
  }, [user?.company_id, user?.delegate_id]);

  // ✅ Initialize with data fetching - only runs once on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Wait for service items to be loaded from context
        if (serviceItemsLoading) return;
        
        // Get the selected service details
        const serviceDetails = getSelectedServiceDetails();
        console.log("Selected Service Details:", serviceDetails);
        
        if (serviceDetails?.pcb_serial_number) {
          setSelectedService(serviceDetails);
          activePCBRef.current = serviceDetails.pcb_serial_number;
          
          // Fetch data for the selected service
          setLoadingMessage("Loading device data...");
          const deviceData = await fetchDataForPCB(serviceDetails.pcb_serial_number);
          
          if (deviceData) {
            // Update sensor data with real values
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
              deviceId: serviceDetails.pcb_serial_number,
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
        } else {
          // No PCB serial number, just mark as loaded
          setInitialDataLoaded(true);
        }
        
        setLoading(false);
        setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
        setManualRefresh(false);
        
      } catch (error) {
        console.error("❌ Error during initialization:", error);
        setLoading(false);
        setInitialDataLoaded(true);
        setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
        setManualRefresh(false);
      }
    };

    // Only run initialization once when the component mounts and service items are loaded
    if (!initialDataLoaded && !serviceItemsLoading) {
      initialize();
    }
  }, [serviceItemsLoading]); // ✅ Only depend on serviceItemsLoading

  // ✅ Fetch all alarms and store full devices data
  const fetchAllAlarms = async () => {
    try {
      const response = await fetch(
        `${baseURL}/get-latest-data/?user_id=${userId}&company_id=${company_id}`
      );

      if (!response.ok) throw new Error("Failed to fetch alarms");

      const data = await response.json();

      if (data.status !== "success" || !data.data) return;

      // ✅ Store the full data for individual alarm counts
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
      console.error("Alarm fetch error:", err);
    }
  };

  // Fetch sensor data for active PCB
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

      if (data?.status !== "success" || !data?.data) return;
      if (activePCBRef.current !== pcbSerialNumber) return;

      const deviceData = data.data;
      const isOnline = deviceData.is_online;

      setSensorData({
        outsideTemp: isOnline ? deviceData.outdoor_temperature?.value : null,
        humidity: isOnline ? deviceData.room_humidity?.value : null,
        roomTemp: isOnline ? deviceData.room_temperature?.value : null,
        // ✅ use the resolved (lock-aware) fan speed instead of trusting the poll blindly
        fanSpeed: isOnline ? resolveFanSpeed(deviceData.fan_speed?.value) : "0",
        // ✅ use the resolved (lock-aware) temperature instead of trusting the poll blindly
        temperature: isOnline ? resolveTemperature(deviceData.set_temperature?.value) : 25,
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
      setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
      setManualRefresh(false);

      if (deviceData.hvac_busy?.value == "0") {
        clearProcessingIfDone();
      }
    } catch (error) {
      console.error("🔥 Fetch Error:", error);
      setPullToRefresh(prev => ({ ...prev, isRefreshing: false }));
      setManualRefresh(false);
    } finally {
      isFetchingRef.current = false; // ✅ always release the lock
    }
  };

  // ✅ Start polling only after initial data is loaded
  useEffect(() => {
    if (!initialDataLoaded || !activePCBRef.current) return;

    if (fetchIntervalRef.current) {
      clearInterval(fetchIntervalRef.current);
      fetchIntervalRef.current = null;
    }

    fetchData();
    fetchAllAlarms();

    fetchIntervalRef.current = setInterval(() => {
      if (processingRef.current) {
        console.log("⏸️ Skipping poll — command processing in progress");
        return; // don't touch fetchData/fetchAllAlarms while a command is in flight
      }
      fetchData();
      fetchAllAlarms();
    }, 40000);

    return () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
    };
  }, [initialDataLoaded, activePCBRef.current]);

  // Update active PCB ref when selected service changes
  useEffect(() => {
    if (selectedService?.pcb_serial_number) {
      console.log("🔄 Switching active PCB to:", selectedService.pcb_serial_number);
      activePCBRef.current = selectedService.pcb_serial_number;
    }
  }, [selectedService?.pcb_serial_number]);

  // ==================== COMMAND FUNCTIONS ====================

  // Processing message cycle functions
  const MIN_PROCESSING_TIME = 5000;
  
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
    }, 40000);

    // Absolute safety net — exit processing regardless, after 60s
    hardStopTimerRef.current = setTimeout(() => {
      stopProcessing();
      fetchData();
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
    if (processingPollRef.current) { // ✅ clear the fast poll too
      clearInterval(processingPollRef.current);
      processingPollRef.current = null;
    }

    setProcessing({ status: false, message: "" });
    processingKindRef.current = null;
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

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
      if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
      if (processingPollRef.current) clearInterval(processingPollRef.current); // ✅
    };
  }, []);

  // Send mode command
  // ✅ MODIFIED: mode changes now show the processing messages again
  const sendModeCommand = async (modeCode, modeName) => {
    console.group("🎛️ MODE COMMAND SENT");
    console.log("📱 Mode clicked:", modeName);
    console.log("🔢 Mode code:", modeCode);
    
    try {
      processingKindRef.current = "mode";
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
      
      console.log("📦 Mode command payload:", payload);
      
      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        console.error("❌ Mode command failed with status:", response.status);
        stopProcessing();
        throw new Error("Failed to send command");
      }
      
      console.log("✅ Mode command sent successfully:", modeName);
      console.groupEnd();
    } catch (error) {
      console.error("❌ Error sending mode command:", error);
      console.groupEnd();
      stopProcessing();
    }
  };

  // Send fan command
  // ✅ MODIFIED: no processing overlay/icon for fan speed changes (only power toggle shows that)
  const sendFanCommand = async (fanSpeed) => {
    const fanSpeedLabel = FAN_LABELS[parseInt(fanSpeed)] || fanSpeed;
    console.group("🌀 FAN SPEED COMMAND SENT");
    console.log("📱 Fan speed clicked:", fanSpeedLabel);
    console.log("🔢 Fan speed code:", fanSpeed);

    // ✅ NEW: lock this value in so polls for the next 60s don't revert it
    pendingFanRef.current = fanSpeed;
    fanLockExpiryRef.current = Date.now() + VALUE_LOCK_DURATION;
    
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
      
      console.log("📦 Fan command payload:", payload);
      
      const response = await fetch("https://mdata.air2o.net/controllers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        console.error("❌ Fan command failed with status:", response.status);
        throw new Error("Failed to send command");
      }
      
      console.log("✅ Fan command sent successfully:", fanSpeedLabel);
      console.groupEnd();
    } catch (error) {
      console.error("❌ Error sending fan command:", error);
      console.groupEnd();
    }
  };

  // Handle mode change
  const handleModeChange = async (newMode) => {
    console.log("🔘 Mode button clicked:", newMode);

    if (isControlDisabled()) {
      console.log("⚠️ Mode change blocked - Conditions not met");
      return;
    }
    
    const newModeCode = MODE_CODE_MAP[newMode] || 1;
    setDisplayData((prev) => ({ ...prev, mode: newModeCode.toString() }));
    
    if (displayData.powerStatus === "on") {
      await sendModeCommand(newModeCode.toString(), newMode);
    } else {
      console.log("💤 Power is OFF - Mode saved locally");
    }
  };

  // Handle fan speed change
  const handleFanSpeedChange = async (newPosition) => {
    const newSpeed = FAN_SPEEDS[newPosition];
    const newSpeedLabel = FAN_LABELS[newPosition];
    
    console.log("🌀 Fan speed button clicked:", newSpeedLabel);

    if (isControlDisabled()) {
      console.log("⚠️ Fan change blocked - Conditions not met");
      return;
    }
    
    setDisplayData((prev) => ({ ...prev, fanSpeed: newSpeed }));
    
    if (displayData.powerStatus === "on") {
      await sendFanCommand(newSpeed);
    } else {
      console.log(`💤 Power is OFF - Fan speed set to ${newSpeedLabel} (will apply when power turns on)`);
    }
  };

  // Handle fan click on button
  const handleFanClick = (index) => {
    console.log("🖱️ Fan button clicked at index:", index, "Label:", FAN_LABELS[index]);
    handleFanSpeedChange(index);
  };

  // Send refresh to controller
  const sendRefreshToController = async () => {
    if (!selectedService?.pcb_serial_number) {
      setRefreshStatus({ sending: false, success: false, message: "No device selected" });
      return { success: false };
    }

    if (!serviceItemPermissions?.can_control_equipment) {
      setRefreshStatus({ sending: false, success: false, message: "Control permissions not available" });
      return { success: false };
    }

    try {
      const result = await sendRefreshCommand(selectedService.pcb_serial_number, sensorData);
      
      if (result?.success) {
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

  // Handle power toggle
  // ✅ MODIFIED: only power toggle shows the processing icon/message
  const handlePowerToggle = async () => {
    console.log("🔘 Power button clicked. Current status:", sensorData.powerStatus);
    
    if (!selectedService?.pcb_serial_number) {
      console.log("❌ No PCB serial number available");
      return;
    }

    if (isControlDisabled()) {
      const msg = sensorData.hvacBusy == "1" ? "System is busy, please wait..." : "Please wait...";
      console.log("⚠️ Power toggle blocked:", msg);
      return;
    }

    try {
      processingKindRef.current = "power";
      startProcessingCycle();

      const newHvacValue = sensorData.powerStatus == "on" ? "0" : "1";
      const isShutdown = displayData?.fanSpeed == 3 || displayData?.mode == 0;

      console.log("⚡ Sending power command. New HVAC value:", newHvacValue);

      const payload = {
        Header: "0xAA",
        DI: selectedService.pcb_serial_number,
        MD: isShutdown ? "3" : displayData.mode,
        FS: isShutdown ? "0" : displayData.fanSpeed,
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
      console.log("✅ Power command sent:", result);
    } catch (error) {
      console.error("🔥 Power toggle error:", error.message);
      stopProcessing();
    }
  };

  // ==================== SERVICE SWITCHING ====================

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

    // ✅ NEW: reset any pending temperature/fan-speed locks from the previous device
    pendingTempRef.current = null;
    tempLockExpiryRef.current = 0;
    pendingFanRef.current = null;
    fanLockExpiryRef.current = 0;
    
    setShowConfirmDialog(false);
    setSwitchingService(true);
    setSwitchingProgress(0);
    
    try {
      // Message 1: Connecting
      setLoadingMessage(SWITCHING_MESSAGES[0]);
      setSwitchingProgress(10);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update the active PCB reference
      activePCBRef.current = pendingService.pcb_serial_number;
      
      // Message 2: Fetching data from the specific PCB
      setLoadingMessage(SWITCHING_MESSAGES[1]);
      setSwitchingProgress(30);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch data for the specific PCB using the single device endpoint
      const deviceData = await fetchDataForPCB(pendingService.pcb_serial_number);
      
      if (!deviceData) {
        setLoadingMessage("Connected but no data available");
        setSwitchingProgress(70);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setSelectedService(pendingService);
        activePCBRef.current = pendingService.pcb_serial_number;
        updateSelectedServiceItem(pendingService.service_item_id);
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
      
      // Update all state with the new device data
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
      activePCBRef.current = pendingService.pcb_serial_number;
      updateSelectedServiceItem(pendingService.service_item_id);
      
      // Message 6: Complete
      setLoadingMessage(SWITCHING_MESSAGES[5]);
      setSwitchingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setSwitchingService(false);
      setLoadingMessage("");
      
      // Show success notification
      setSwitchNotification({ 
        show: true, 
        message: `✅ Successfully switched to ${pendingService.service_item_name}` 
      });
      
      setTimeout(() => {
        setSwitchNotification({ show: false, message: "" });
      }, 3000);
      
    } catch (error) {
      console.error("❌ Error switching service:", error);
      setSwitchingService(false);
      setLoadingMessage("");
      
      setSelectedService(pendingService);
      activePCBRef.current = pendingService.pcb_serial_number;
      updateSelectedServiceItem(pendingService.service_item_id);
      
      setSwitchNotification({ 
        show: true, 
        message: `⚠️ Switched to ${pendingService.service_item_name}` 
      });
      
      setTimeout(() => {
        setSwitchNotification({ show: false, message: "" });
      }, 3000);
    }
  };

  // Cancel service switch
  const cancelServiceSwitch = () => {
    setShowConfirmDialog(false);
    setPendingService(null);
  };

  // ==================== NAVIGATION & UI HANDLERS ====================

  const handleNavigation = (path) => {
    if (!processing.status) {
      console.log("🧭 Navigating to:", path);
      navigate(path);
    } else {
      console.log("⚠️ Navigation blocked - command in progress");
    }
  };

  // Pull-to-refresh handlers
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
      setPullToRefresh({
        isPulling: true,
        pullDistance: Math.min(pullDistance, MAX_PULL),
        isRefreshing: false,
      });
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
      setPullToRefresh({
        isPulling: true,
        pullDistance: Math.min(pullDistance, MAX_PULL),
        isRefreshing: false,
      });
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
    console.log("🚪 User logging out");
    logout();
    navigate("/");
  };

  const getModeDescription = (code) => MODE_MAP[code] || "Fan";

  const pullProgress = Math.min(pullToRefresh.pullDistance / PULL_THRESHOLD, 1);
  const indicatorRotation = pullProgress * 360;
  const indicatorOpacity = pullProgress;

  // Loading states - only show initial loading if not loaded yet
  if (serviceItemsLoading || (loading && !initialDataLoaded)) {
    return (
      <div
        className="mainmain-container"
        style={{
          backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          color: "white",
        }}
      >
        <div style={{ color: "white", fontSize: "18px", marginBottom: "10px" }}>
          {loadingMessage || "Loading..."}
        </div>
        <div style={{ 
          width: "40px", 
          height: "40px", 
          border: "4px solid rgba(255,255,255,0.3)",
          borderTop: "4px solid white",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            color: "white",
            border: "1px solid white",
            borderRadius: "8px",
            padding: "8px 16px",
            cursor: "pointer",
            fontSize: "16px",
            marginTop: "20px",
          }}
        >
          <FiLogOut size={20} />
          <span>Logout</span>
        </button>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // No service items case
  if (!serviceItemsLoading && serviceItems.length === 0 && initialDataLoaded) {
    return (
      <div className="mainmain-container" style={{
        backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        textAlign: "center"
      }}>
        <div className="logo">
          <img src={AIROlogo} alt="AIRO Logo" className="logo-image" style={{ marginBottom: "20px" }} />
        </div>
        
        <div style={{
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          padding: "40px",
          borderRadius: "12px",
          maxWidth: "500px",
          width: "100%"
        }}>
          <h2 style={{ color: "white", marginBottom: "20px", fontSize: "24px" }}>
            No Machines Assigned
          </h2>
          <p style={{ color: "white", marginBottom: "30px", fontSize: "16px", lineHeight: "1.5" }}>
            You don't have any machines assigned to your account yet.
          </p>
          
          <button
            onClick={handleLogout}
            style={{
              padding: "12px 24px",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: "0 auto"
            }}
          >
            <FiLogOut size={18} />
            Logout
          </button>
        </div>
        
        <div className="footer-logo" style={{ marginTop: "40px" }}>
          <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="mainmain-container" 
      style={{
        backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
        touchAction: "pan-y",
      }}
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
                  transition: 'transform 0.2s ease',
                  opacity: indicatorOpacity,
                }}
              />
              <span>
                {pullToRefresh.pullDistance >= PULL_THRESHOLD
                  ? "Release to refresh"
                  : "Pull down to refresh"}
              </span>
            </>
          )}
        </div>
      )}

      <div className="main-container">
        {/* Refresh status toast */}
        {refreshStatus.message && (
          <div className={`refresh-status-toast ${refreshStatus.success ? 'success' : 'error'}`}>
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
            </div>
          </div>
        )}

        {/* Header: Service Dropdown + Power Button Row */}
        <div className="header-controls-row">
          {/* Service Dropdown - with alarm badges */}
          <div className="service-dropdown-wrapper">
            <div className="service-dropdown-container" style={{ position: "relative" }}>
              <div
                className="service-dropdown-header"
                onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                style={{ position: "relative", cursor: "pointer" }}
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
                    const displayName = serviceItemsList.find(i => i.service_item_id === item.service_item)?.service_item_name || item.service_item;
                    const fullItem = serviceItemsList.find(i => i.service_item_id === item.service_item);
                    
                    // ✅ Get alarm count for this specific item
                    const itemAlarmCount = getAlarmCountForItem(
                      { service_item_id: item.service_item }, 
                      allDevicesData
                    );
                    
                    return (
                      <div
                        key={item.service_item}
                        className={`service-dropdown-item ${
                          selectedService?.service_item_id === item.service_item ? "active" : ""
                        }`}
                        onClick={() => {
                          handleServiceSelect(fullItem || { 
                            service_item_id: item.service_item, 
                            service_item_name: displayName,
                            pcb_serial_number: item.pcb_serial_number 
                          });
                        }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>{displayName}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {selectedService?.service_item_id === item.service_item && (
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
              className={`screen1-power-button ${processing.status && processingKindRef.current === "power" ? "processing" : ""}`}
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
              {processing.status && processingKindRef.current === "power" && <span className="screen1-processing-indicator"></span>}
            </button>
            {sensorData.errorFlag == "1" && <div className="error-indicator" />}
          </div>
        </div>

        {/* Logo below the row */}
        <div className="logo-container">
          <img src={AIROlogo} alt="AIRO Logo" className="logo-image" />
        </div>

        {/* Temperature Dial */}
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
        
        {/* Offline banner between header and temperature dial */}
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

        {/* ✅ NEW: Alarm banner */}
        {hasActiveAlarm && (
          <div className="screen1-error-message">🚨 System Alarm Occurred - Controls Disabled</div>
        )}

        {sensorData.hvacBusy == "1" && !processing.status && (
          <div className="screen1-busy-message">⏳ System is currently busy - Control Disabled</div>
        )}

        {!serviceItemPermissions?.can_control_equipment && (
          <div className="warning-message">⚠️ Control permissions not available</div>
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
                onClick={() => {
                  console.log("🖱️ Mode button clicked in footer:", mode);
                  handleModeChange(mode);
                }}
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
                onClick={() => {
                  console.log(`🖱️ Fan speed button clicked in footer: ${label} (index: ${index})`);
                  handleFanClick(index);
                }}
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
          <button
            className={`control-btn ${!hasValidPCBSerial ? 'screen1-disabled-btn' : ''}`}
            disabled={!hasValidPCBSerial || !serviceItemPermissions?.can_control_equipment}
            title={!hasValidPCBSerial ? "Modes unavailable - No PCB serial number assigned to this machine" : ""}
          >
          </button>

          <button
            className="control-btn"
            onClick={() => {
              console.log("🔔 Alarms button clicked. Error count:", errorCount);
              navigate("/Delegate-alarms", {
                state: {
                  alarmData: {
                    alarmOccurred: sensorData.alarmOccurred,
                    errorCount: errorCount,
                    deviceId: sensorData.deviceId,
                  },
                  userId: userId,
                  company_id: company_id
                },
              });
            }}
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

          <button
            className="control-btn"
            onClick={() => {
              console.log("⏰ Timers button clicked");
              handleNavigation("/timers");
            }}
            disabled={!serviceItemPermissions?.can_control_equipment}
          >
            <FiWatch size={20} />
            <span>Timers</span>
          </button>

          <button
            className="control-btn"
            onClick={() => {
              console.log("⚙️ Settings button clicked");
              handleNavigation("/settings");
            }}
          >
            <FiSettings size={20} />
            <span>Settings</span>
          </button>

          <button
            className="control-btn"
            onClick={() => {
              console.log("🛠️ Services button clicked - navigating to delegate-home");
              handleNavigation("/delegate-home");
            }}
          >
            <FiZap size={20} />
            <span>Services</span>
          </button>

          <button
            className="control-btn"
            onClick={() => {
              console.log("🚪 Logout button clicked");
              handleLogout();
            }}
          >
            <FiLogOut size={20} />
            <span>Logout</span>
          </button>
        </div>

        <div className="footer-logo">
          <img src={greenAire} alt="GreenAire Logo" className="logo-image" />
        </div>
      </div>
    </div>
  );
};

export default DelegateScreen1;