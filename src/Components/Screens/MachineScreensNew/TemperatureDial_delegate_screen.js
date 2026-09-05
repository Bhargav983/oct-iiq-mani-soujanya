


import React, { useEffect, useState, useRef } from "react";

const MIN_TEMP = 0;
const MAX_TEMP = 30;
const SIZE = 285;
const CENTER = SIZE / 2;  // 142.5
const ARC_RADIUS = 110;
const HANDLE_RADIUS = 12;

// ─── CHANGED: Full circle like TemperatureDial ──────────────────────────
const ARC_START = -90;
const ARC_END = 270;  // CHANGED from 0 to 270
const ARC_RANGE = ARC_END - ARC_START; // 360° (full circle)
const DEGREE_RANGE = 360;  // NEW: For full circle

// ─── temperatureToAngle for FULL range (0-30°C) ──────────────────────────
// For the background arc (0°C to 18°C)
const temperatureToAngleFull = (temp) => {
  const t = typeof temp === "string" ? parseFloat(temp) : temp;
  const clamped = Math.min(Math.max(isNaN(t) ? 0 : t, MIN_TEMP), MAX_TEMP);
  if (clamped <= 18) {
    const progress = (clamped - MIN_TEMP) / 18;
    return ARC_START + progress * (ARC_RANGE * 0.25);  // -90° → 0°
  } else {
    const progress = (clamped - 18) / (MAX_TEMP - 18);
    return ARC_START + (ARC_RANGE * 0.25) + progress * (ARC_RANGE * 0.75);  // 0° → 270°
  }
};

// ─── temperatureToAngle for DRAGGABLE range (18-30°C) ───────────────────
const temperatureToAngleDraggable = (temp) => {
  const t = typeof temp === "string" ? parseFloat(temp) : temp;
  const clamped = Math.min(Math.max(isNaN(t) ? 18 : t, 18), MAX_TEMP);
  const progress = (clamped - 18) / (MAX_TEMP - 18);
  return ARC_START + (ARC_RANGE * 0.25) + progress * (ARC_RANGE * 0.75);  // 0° → 270°
};

// ─── CHANGED: Angle to temperature for FULL range ──────────────────────
const angleToTemperature = (ang) => {
  let a = ang;
  if (a < ARC_START) a += 360;
  if (a > ARC_END) a -= 360;
  a = Math.min(Math.max(a, ARC_START), ARC_END);
  const relative = a - ARC_START;
  
  if (relative <= ARC_RANGE * 0.25) {
    const progress = relative / (ARC_RANGE * 0.25);
    return MIN_TEMP + progress * (18 - MIN_TEMP);
  } else {
    const progress = (relative - ARC_RANGE * 0.25) / (ARC_RANGE * 0.75);
    return 18 + progress * (MAX_TEMP - 18);
  }
};

const arcPoint = (angleDeg) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + ARC_RADIUS * Math.cos(rad),
    y: CENTER + ARC_RADIUS * Math.sin(rad),
  };
};

// ─── buildArcPath with startAngle and endAngle ──────────────────────────
const buildArcPath = (startAngle, endAngle) => {
  const start = arcPoint(startAngle);
  const end = arcPoint(endAngle);
  let delta = endAngle - startAngle;
  if (delta < 0) delta += 360;
  const largeArc = delta > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

const getFanSpeedDescription = (speed) => {
  if (speed === 0 || speed === "0") return "High";
  if (speed === 1 || speed === "1") return "Medium";
  if (speed === 2 || speed === "2") return "Low";
  return "High";
};

// ─── Component ────────────────────────────────────────────────────────────────

const DelegateTemperatureDial = ({
  onTempChange,
  fanSpeed,
  onTempChangeEnd,
  initialTemperature,
  disabled,
}) => {
  const [angle, setAngle] = useState(() => temperatureToAngleDraggable(initialTemperature ?? 18));
  const [temperature, setTemperature] = useState(() => Math.round(initialTemperature ?? 18));

  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  const angleRef = useRef(angle);
  const tempRef = useRef(temperature);
  const disabledRef = useRef(disabled);
  const onTempChangeRef = useRef(onTempChange);
  const onTempChangeEndRef = useRef(onTempChangeEnd);

  angleRef.current = angle;
  tempRef.current = temperature;
  disabledRef.current = disabled;
  onTempChangeRef.current = onTempChange;
  onTempChangeEndRef.current = onTempChangeEnd;

  // ── Sync from parent ──────────────────────────────────────────────────────
  useEffect(() => {
    if (initialTemperature == null) return;
    const t = typeof initialTemperature === "string"
      ? parseFloat(initialTemperature)
      : initialTemperature;
    if (isNaN(t)) return;
    if (isDraggingRef.current) return;
    const clamped = Math.min(Math.max(t, 18), MAX_TEMP);
    const rounded = Math.round(clamped);
    setTemperature(rounded);
    setAngle(temperatureToAngleDraggable(rounded));
  }, [initialTemperature]);

  // ── Drag logic ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pointerToAngle = (clientX, clientY) => {
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;

      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      if (deg > 270) deg -= 360;
      
      // ─── CHANGED: Only allow 18-30°C range (0° to 270°) ───────────────
      const MIN_DRAG_ANGLE = ARC_START + (ARC_RANGE * 0.25); // 0°
      const MAX_DRAG_ANGLE = ARC_END; // 270°
      return Math.min(Math.max(deg, MIN_DRAG_ANGLE), MAX_DRAG_ANGLE);
    };

    const isOnHandle = (clientX, clientY) => {
      const rect = container.getBoundingClientRect();
      const scaleX = rect.width / SIZE;
      const scaleY = rect.height / SIZE;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const currentAngle = angleRef.current;
      const pt = arcPoint(currentAngle);
      const hx = cx + (pt.x - CENTER) * scaleX;
      const hy = cy + (pt.y - CENTER) * scaleY;

      const hitRadius = (HANDLE_RADIUS + 10) * Math.max(scaleX, scaleY);
      return Math.hypot(clientX - hx, clientY - hy) <= hitRadius;
    };

    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const a = pointerToAngle(clientX, clientY);
      const temp = angleToTemperature(a);
      const rounded = Math.round(temp);

      setAngle(a);
      setTemperature(rounded);
      onTempChangeRef.current?.(rounded);
    };

    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      onTempChangeEndRef.current?.(tempRef.current);
    };

    const onDown = (e) => {
      if (disabledRef.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (!isOnHandle(clientX, clientY)) return;
      e.preventDefault();
       e.stopPropagation();
      isDraggingRef.current = true;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    };

    container.addEventListener("mousedown", onDown);
    container.addEventListener("touchstart", onDown, { passive: false });

    return () => {
      container.removeEventListener("mousedown", onDown);
      container.removeEventListener("touchstart", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  // ─── Calculate BOTH arcs ──────────────────────────────────────────────────
  const handlePt = arcPoint(angle);
  
  // Arc 1: 0°C to 18°C (from -90° to 0°) - ALWAYS VISIBLE (dimmer)
  const angleAt18C = ARC_START + (ARC_RANGE * 0.25); // 0°
  const arcPath0to18 = buildArcPath(ARC_START, angleAt18C);
  
  // Arc 2: 18°C to current temperature (from 0° to current angle) - BRIGHT (draggable)
  const arcPath18toCurrent = buildArcPath(angleAt18C, angle);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="temp-container del-temp-container"
      style={{
        position: "relative",
        width: SIZE,
        height: SIZE,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <div
        className="temp-circle-control"
        style={{ position: "relative", width: "100%", height: "100%" }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          {/* Background ring - always visible */}
          <circle
            cx={CENTER} cy={CENTER} r={ARC_RADIUS}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.4"
            strokeWidth="10"
          />

          {/* ─── Arc 0°C to 18°C - Always visible (dimmer) ─────────────── */}
          <path
            d={arcPath0to18}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="1"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* ─── Arc 18°C to current temperature - Bright (draggable) ──── */}
          <path
            d={arcPath18toCurrent}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="1"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Handle dot */}
          <circle
            cx={handlePt.x}
            cy={handlePt.y}
            r={HANDLE_RADIUS}
            fill="white"
            stroke="#2b7ed6"
            strokeWidth="2.5"
            pointerEvents="none"
            style={{
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
            }}
          />
        </svg>

        {/* Inner display circle */}
        <div
          className="temp-inner-circle"
          style={{
            position: "absolute",
            left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            width: 180, height: 180,
            borderRadius: "50%",
            background: "#fff",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <div className="temp-display">
            <div className="temp-temperature">{temperature}°C</div>
          </div>
          <div className="temp-fan-container">
            <div className="temp-fan-icon-container">
              <div className="temp-fan-bar1" />
              <div className="temp-fan-bar2" />
              <div className="temp-fan-bar3" />
              <div className="temp-fan-bar3" />
            </div>
            <span className="temp-fan-speed">{getFanSpeedDescription(fanSpeed)}</span>
          </div>
          <div className="temp-fan-label">Fan Speed</div>
        </div>

        {/* Tick marks */}
        {Array.from({ length: 48 }, (_, i) => (
          <div
            key={i}
            className="temp-tick"
            style={{
              position: "absolute",
              left: "50%", top: "50%",
              width: 4, height: 12,
              background: "rgba(255, 255, 255, 0.47)",
              borderRadius: 2,
              pointerEvents: "none",
              transform: `translate(-50%, -50%) rotate(${i * 7.5}deg) translate(0, -135px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default DelegateTemperatureDial;