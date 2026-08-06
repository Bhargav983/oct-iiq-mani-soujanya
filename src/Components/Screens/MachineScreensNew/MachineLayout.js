// MachineLayout.js (FINAL WORKING VERSION)
import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Screen1 from "./Screen1";

const MachineLayout = () => {
  const location = useLocation();

  const childRoutes = [
    "/machinescreen2",
    "/alarms",
    "/timers",
    "/settings",
    "/machine-service-request-form",
    "/machine",
    "/home",
    "/request",
    "/chat-bot",
    "/view-delegates",
    "/service-form",
  ];

  const isChildScreen = childRoutes.includes(location.pathname);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {/* 🔥 Screen1 ALWAYS stays mounted */}
      <div
        style={{
          display: isChildScreen ? "none" : "block",
          width: "100%",
          height: "100%",
        }}
      >
        <Screen1 />
      </div>

      {/* Outlet renders ONLY child screens */}
      <div
        style={{
          display: isChildScreen ? "block" : "none",
          width: "100%",
          height: "100%",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default MachineLayout;
