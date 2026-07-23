import React from "react";
import { FAN_LABELS, MODE_MAP } from "../constants";

const disabledStyle = (disabled) => ({
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

const MachineControls = ({
  currentMode,
  fanPosition,
  controlsDisabled,
  onModeChange,
  onFanSpeedChange,
}) => (
  <>
    <div className="modes-section-in-footer">
      <h3 className="modes-heading">Modes</h3>
      <div className="modes-row">
        {Object.values(MODE_MAP).map((mode) => (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={`modes-button ${
              currentMode === mode ? "modes-button-selected" : ""
            }`}
            disabled={controlsDisabled}
            style={disabledStyle(controlsDisabled)}
          >
            <span
              className={`modes-text ${
                currentMode === mode ? "modes-text-selected" : ""
              }`}
            >
              {mode}
            </span>
          </button>
        ))}
      </div>
    </div>

    <div className="fan-speed-section-in-footer">
      <h3 className="fan-speed-heading">Fan Speed</h3>
      <div className="fan-speed-buttons-row">
        {FAN_LABELS.map((label, index) => (
          <button
            key={label}
            onClick={() => onFanSpeedChange(index)}
            className={`fan-speed-button ${
              fanPosition === index ? "fan-speed-button-selected" : ""
            }`}
            disabled={controlsDisabled}
            style={disabledStyle(controlsDisabled)}
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
  </>
);

export default MachineControls;
