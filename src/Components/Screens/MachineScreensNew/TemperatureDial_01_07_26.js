

//  code changed as per the figma of the Octane Team  and also implemented the temperature from 18 to 30 in whole circle 


import React, { useEffect, useState, useRef } from "react";

// 👇 CHANGED: Now starts at 18°C
const MIN_TEMP = 18;      // CHANGED from 0 to 18
const MAX_TEMP = 30;
const START_ANGLE = 0;    // CHANGED from -90 to 0
const DEGREE_RANGE = 270; // CHANGED from 360 to 270 (only 270° movement)
const SIZE = 280;
const CENTER = SIZE / 2;
const ARC_RADIUS = 110;
const HANDLE_RADIUS = 12;

// ─── Pure math helpers ────────────────────────────────────────────────────────

// 👇 CHANGED: Only 18°C to 30°C
const temperatureToAngle = (temp) => {
  const t = typeof temp === "string" ? parseFloat(temp) : temp;
  const clamped = Math.min(Math.max(isNaN(t) ? 18 : t, MIN_TEMP), MAX_TEMP);
  const progress = (clamped - MIN_TEMP) / (MAX_TEMP - MIN_TEMP);
  return START_ANGLE + progress * DEGREE_RANGE;
};

// 👇 CHANGED: Only 18°C to 30°C
const angleToTemperature = (ang) => {
  let a = ang;
  if (a < START_ANGLE) a += 360;
  if (a > START_ANGLE + DEGREE_RANGE) a -= 360;
  a = Math.min(Math.max(a, START_ANGLE), START_ANGLE + DEGREE_RANGE);
  const progress = (a - START_ANGLE) / DEGREE_RANGE;
  return MIN_TEMP + progress * (MAX_TEMP - MIN_TEMP);
};

const arcPoint = (angleDeg) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + ARC_RADIUS * Math.cos(rad),
    y: CENTER + ARC_RADIUS * Math.sin(rad),
  };
};

const buildArcPath = (currentAngle) => {
  const start = arcPoint(START_ANGLE);
  const end = arcPoint(currentAngle);
  let delta = currentAngle - START_ANGLE;
  if (delta < 0) delta += 360;
  const largeArc = delta > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

const getFanLabel = (s) => {
  if (s === 0 || s === "0") return "High";
  if (s === 1 || s === "1") return "Medium";
  if (s === 2 || s === "2") return "Low";
  return "High";
};

// ─── Component ────────────────────────────────────────────────────────────────

const TemperatureDial = ({
  onTempChange,
  fanSpeed,
  onTempChangeEnd,
  initialTemperature,
  disabled,
}) => {
  // 👇 CHANGED: Default to 18°C instead of 0°C
  const [angle, setAngle] = useState(() => temperatureToAngle(initialTemperature ?? MIN_TEMP));
  const [temperature, setTemperature] = useState(() => Math.round(initialTemperature ?? MIN_TEMP));

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

  useEffect(() => {
    if (initialTemperature == null) return;
    const t = typeof initialTemperature === "string"
      ? parseFloat(initialTemperature)
      : initialTemperature;
    if (isNaN(t)) return;
    if (isDraggingRef.current) return;
    // 👇 CHANGED: Clamp to 18-30°C
    const clamped = Math.min(Math.max(t, MIN_TEMP), MAX_TEMP);
    const rounded = Math.round(clamped);
    setTemperature(rounded);
    setAngle(temperatureToAngle(rounded));
  }, [initialTemperature]);

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
      // 👇 CHANGED: Only allow 0° to 270°
      return Math.min(Math.max(deg, START_ANGLE), START_ANGLE + DEGREE_RANGE);
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
      const dist = Math.hypot(clientX - hx, clientY - hy);
      return dist <= hitRadius;
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

  const handlePt = arcPoint(angle);
  const arcPath = buildArcPath(angle);

  return (
    <div
      ref={containerRef}
      className="temp-container"
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
          <circle
            cx={CENTER} cy={CENTER} r={ARC_RADIUS}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.4"
            strokeWidth="10"
          />
          <path
            d={arcPath}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="1"
            strokeWidth="10"
            strokeLinecap="round"
          />
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

        <div
          className="temp-inner-circle"
          style={{
            position: "absolute",
            left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            width: 175, height: 175,
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
            <span className="temp-fan-speed">{getFanLabel(fanSpeed)}</span>
          </div>
          <div className="temp-fan-label">Fan Speed</div>
        </div>

        {Array.from({ length: 48 }, (_, i) => (
          <div
            key={i}
            className="temp-tick"
            style={{
              position: "absolute",
              left: "50%", top: "50%",
              width: 4, height: 12,
              background: "rgba(255,255,255,0.47)",
              borderRadius: 2,
              pointerEvents: "none",
              transform: `translate(-50%,-50%) rotate(${i * 7.5}deg) translate(0,-135px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default TemperatureDial;
