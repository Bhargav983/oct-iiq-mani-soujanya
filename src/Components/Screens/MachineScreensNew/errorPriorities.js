export const ERROR_PRIORITIES = {
  // CRITICAL (Blocking)
  2: "critical", 20: "critical",
  // HIGH (Blocking)
  1: "HIGH", 3: "HIGH", 4: "HIGH", 5: "HIGH", 7: "HIGH", 8: "HIGH", 9: "HIGH",
  // MEDIUM (Blocking)
  16: "MEDIUM", 17: "MEDIUM",
  // LOW (Non-Blocking)
  6: "LOW", 10: "LOW", 11: "LOW", 12: "LOW", 13: "LOW", 14: "LOW", 15: "LOW", 18: "LOW", 19: "LOW"
};

/**
 * Checks if a given active alarm code should block user controls.
 * Returns true only for MEDIUM, HIGH, and CRITICAL errors.
 */
export const shouldBlockControls = (alarmOccurred) => {
  if (!alarmOccurred || alarmOccurred === "0") return false;
  
  // Parse the alarm code (handle string or numeric codes)
  const errorCode = parseInt(alarmOccurred, 10);
  const priority = ERROR_PRIORITIES[errorCode];
  
  // Only block if priority is MEDIUM, HIGH, or CRITICAL (case-insensitive check)
  if (!priority) return false;
  const upperPriority = priority.toUpperCase();
  return upperPriority === "MEDIUM" || upperPriority === "HIGH" || upperPriority === "CRITICAL";
};
