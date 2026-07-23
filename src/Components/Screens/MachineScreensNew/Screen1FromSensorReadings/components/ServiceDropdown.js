import React from "react";
import { FiChevronDown } from "react-icons/fi";
import { getAlarmCountForItem, getOnlineStatusForItem } from "../utils";

const AlarmBadge = ({ count, compact = false }) => {
  if (count <= 0) return null;
  return (
    <span
      style={{
        backgroundColor: "red",
        color: "white",
        borderRadius: "50%",
        width: compact ? "18px" : "20px",
        height: compact ? "18px" : "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "10px",
        fontWeight: "bold",
        minWidth: compact ? undefined : "20px",
        ...(compact ? { position: "absolute", top: "0px", right: "28px" } : {}),
      }}
    >
      {count}
    </span>
  );
};

const ServiceDropdown = ({
  isOpen,
  onToggle,
  services,
  selectedService,
  allDevicesData,
  totalAlarmCount,
  onSelect,
}) => (
  <div className="service-dropdown-wrapper">
    <div className="service-dropdown-container">
      <div
        className="service-dropdown-header"
        onClick={onToggle}
        style={{ position: "relative" }}
      >
        <span>
          {selectedService ? selectedService.service_item_name : "Select Service"}
        </span>
        <AlarmBadge count={totalAlarmCount} compact />
        <FiChevronDown size={18} />
      </div>

      {isOpen && (
        <div className="service-dropdown-list">
          {services.map((item) => {
            const alarmCount = getAlarmCountForItem(item, allDevicesData);
            const isOnline = getOnlineStatusForItem(item, allDevicesData);
            const isSelected =
              selectedService?.service_item_id === item.service_item_id;

            return (
              <div
                key={item.service_item_id}
                className={`service-dropdown-item ${isSelected ? "active" : ""} ${
                  isOnline === true ? "online" : ""
                }`}
                onClick={() => onSelect(item)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{item.service_item_name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    className={`service-online-status ${
                      isOnline === true
                        ? "online"
                        : isOnline === false
                        ? "offline"
                        : "checking"
                    }`}
                    aria-label={
                      isOnline === true
                        ? "Online"
                        : isOnline === false
                        ? "Offline"
                        : "Checking status"
                    }
                  >
                    <span className="service-online-dot" />
                    {isOnline === true
                      ? "Online"
                      : isOnline === false
                      ? "Offline"
                      : "Checking"}
                  </span>
                  {item.permissions?.can_control_equipment === false && (
                    <span className="service-permission-badge">View only</span>
                  )}
                  {isSelected && <span style={{ color: "#3E99ED" }}>✓</span>}
                  <AlarmBadge count={alarmCount} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

export default ServiceDropdown;
