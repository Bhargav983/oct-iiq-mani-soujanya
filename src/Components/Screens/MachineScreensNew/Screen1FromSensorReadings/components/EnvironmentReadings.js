import React from "react";
import { FiDroplet, FiSun, FiThermometer } from "react-icons/fi";
import { formatTemp } from "../utils";

const EnvironmentReading = ({ icon, value, label }) => (
  <div className="env-item">
    {icon}
    <div className="env-value">{value}</div>
    <div className="env-label">{label}</div>
  </div>
);

const EnvironmentReadings = ({ sensorData }) => {
  const displayValue = (value, suffix) =>
    sensorData.isOnline ? `${formatTemp(value)}${suffix}` : "—";

  return (
    <div className="env-info">
      <EnvironmentReading
        icon={<FiSun className="env-icon" size={20} color="#FFFFFF" />}
        value={displayValue(sensorData.outsideTemp, "°C")}
        label="Outside Temp"
      />
      <EnvironmentReading
        icon={<FiThermometer className="env-icon" size={20} color="#FFFFFF" />}
        value={displayValue(sensorData.roomTemp, "°C")}
        label="Room Temp"
      />
      <EnvironmentReading
        icon={<FiDroplet className="env-icon" size={20} color="#FFFFFF" />}
        value={displayValue(sensorData.humidity, "%")}
        label="Humidity"
      />
    </div>
  );
};

export default EnvironmentReadings;
