import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import {
  getAlarmCountForItem,
  getLiveAlarmTotal,
  getMachineStatusForItem,
} from "../utils";

const STATUS_LABELS = {
  error: "Error",
  online: "Online",
  offline: "Offline",
  checking: "Checking",
};

export const getDropdownScrollState = (element) => {
  if (!element) return { isScrollable: false, hasMoreBelow: false };
  const overflow = element.scrollHeight - element.clientHeight;
  return {
    isScrollable: overflow > 2,
    hasMoreBelow: overflow - element.scrollTop > 2,
  };
};

export const formatAlarmCount = (count) => (count > 99 ? "99+" : String(count));

const AlarmBadge = ({ count, compact = false, label }) => {
  if (count <= 0) return null;
  return (
    <span
      className={`service-alarm-badge ${compact ? "total" : "unit"}`}
      aria-label={label}
      title={label}
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
      }}
    >
      {formatAlarmCount(count)}
    </span>
  );
};

const ServiceDropdown = ({
  isOpen,
  onToggle,
  services,
  selectedService,
  allDevicesData,
  onSelect,
}) => {
  const listRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    isScrollable: false,
    hasMoreBelow: false,
  });
  const liveAlarmCount = getLiveAlarmTotal(services, allDevicesData);

  const updateScrollState = useCallback(() => {
    setScrollState(getDropdownScrollState(listRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setScrollState({ isScrollable: false, hasMoreBelow: false });
      return undefined;
    }

    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollState)
        : null;
    if (observer && listRef.current) observer.observe(listRef.current);

    return () => {
      window.removeEventListener("resize", updateScrollState);
      observer?.disconnect();
    };
  }, [isOpen, services.length, updateScrollState]);

  return (
    <div className="service-dropdown-wrapper" data-pull-refresh-ignore="true">
      <div className="service-dropdown-container">
        <div
          className="service-dropdown-header"
          onClick={onToggle}
          style={{ position: "relative" }}
        >
          <span>
            {selectedService ? selectedService.service_item_name : "Select Service"}
          </span>
          <span className="service-dropdown-actions" aria-hidden="false">
            <AlarmBadge
              count={liveAlarmCount}
              compact
              label={`${liveAlarmCount} total live ${liveAlarmCount === 1 ? "error" : "errors"}`}
            />
            <FiChevronDown size={18} aria-hidden="true" />
          </span>
        </div>

        {isOpen && (
          <>
            <div
              ref={listRef}
              className={`service-dropdown-list ${
                scrollState.isScrollable ? "is-scrollable" : ""
              }`}
              onScroll={updateScrollState}
              data-testid="service-dropdown-list"
            >
              {services.map((item) => {
                const alarmCount = getAlarmCountForItem(item, allDevicesData);
                const machineStatus = getMachineStatusForItem(item, allDevicesData);
                const isSelected =
                  selectedService?.service_item_id === item.service_item_id;

                return (
                  <div
                    key={item.service_item_id}
                    className={`service-dropdown-item ${
                      isSelected ? "active" : ""
                    } ${machineStatus}`}
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
                        className={`service-online-status ${machineStatus}`}
                        aria-label={
                          machineStatus === "checking"
                            ? "Checking status"
                            : STATUS_LABELS[machineStatus]
                        }
                      >
                        <span className="service-online-dot" />
                        {STATUS_LABELS[machineStatus]}
                      </span>
                      {item.permissions?.can_control_equipment === false && (
                        <span className="service-permission-badge">View only</span>
                      )}
                      {isSelected && <span style={{ color: "#3E99ED" }}>✓</span>}
                      <AlarmBadge
                        count={alarmCount}
                        label={`${alarmCount} live ${alarmCount === 1 ? "error" : "errors"} for ${item.service_item_name}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {scrollState.isScrollable && scrollState.hasMoreBelow && (
              <div className="service-scroll-hint" role="status" aria-live="polite">
                <span>Scroll for more machines</span>
                <FiChevronDown aria-hidden="true" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ServiceDropdown;