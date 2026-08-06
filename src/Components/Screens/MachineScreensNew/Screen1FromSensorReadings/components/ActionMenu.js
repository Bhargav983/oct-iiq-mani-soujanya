import React from "react";
import { FiClock, FiLogOut, FiSettings, FiWatch, FiZap } from "react-icons/fi";
import { FiMessageCircle } from "react-icons/fi";

const ActionMenu = ({
  hasValidPCBSerial,
  errorCount,
  onAlarms,
  onNavigate,
  onLogout,
  servicePath = "/machine",
  timersDisabled = false,
  timersPath = "/timers",
  chatBotPath = "/chat-bot",
  settingsPath = "/settings",
}) => (
  <div className="control-buttons">
    {/* <button
      className={`control-btn ${!hasValidPCBSerial ? "screen1-disabled-btn" : ""}`}
      disabled={!hasValidPCBSerial}
      title={
        !hasValidPCBSerial
          ? "Modes unavailable - No PCB serial number assigned to this machine"
          : ""
      }
      aria-label="Machine modes placeholder"
    /> */}

     <button className="control-btn" onClick={() => onNavigate(chatBotPath)}>
      <FiMessageCircle size={20} />
      <span>Chatbot</span>
    </button> 

    <button className="control-btn" onClick={onAlarms}>
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

    <button className="control-btn" onClick={() => onNavigate(timersPath)} disabled={timersDisabled}>
      <FiWatch size={20} />
      <span>Timers</span>
    </button>
    <button className="control-btn" onClick={() => onNavigate(settingsPath)}>
      <FiSettings size={20} />
      <span>Settings</span>
    </button>
    <button className="control-btn" onClick={() => onNavigate(servicePath)}>
      <FiZap size={20} />
      <span>Services</span>
    </button>
    <button className="control-btn" onClick={onLogout}>
      <FiLogOut size={20} />
      <span>Logout</span>
    </button>
  </div>
);

export default ActionMenu;
