import React from "react";
import { FiPower } from "react-icons/fi";
import ServiceDropdown from "./ServiceDropdown";

const MachineHeader = ({
  dropdownProps,
  processing,
  sensorData,
  controlsDisabled,
  onPowerToggle,
}) => (
  <div className="header-controls-row">
    <ServiceDropdown {...dropdownProps} />
    <div style={{ position: "relative" }}>
      <button
        className={`screen1-power-button ${processing.status ? "processing" : ""}`}
        onClick={onPowerToggle}
        disabled={controlsDisabled}
        style={{
          backgroundColor: !sensorData.isOnline
            ? "#808080"
            : sensorData.powerStatus === "on"
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
          cursor: controlsDisabled ? "not-allowed" : "pointer",
          fontWeight: "bold",
          opacity: controlsDisabled ? 0.6 : 1,
        }}
      >
        <FiPower size={24} color="#fff" />
        {processing.status && <span className="screen1-processing-indicator" />}
      </button>
      {sensorData.errorFlag === "1" && <div className="error-indicator" />}
    </div>
  </div>
);

export default MachineHeader;
