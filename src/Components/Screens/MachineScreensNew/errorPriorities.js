
export const ERROR_PRIORITIES = {
  // CRITICAL (Blocking)
  2: "CRITICAL", 20: "CRITICAL",
  // HIGH (Blocking)
  1: "HIGH", 3: "HIGH", 4: "HIGH", 5: "HIGH", 7: "HIGH", 8: "HIGH", 9: "HIGH",
  // MEDIUM (Blocking)
  16: "MEDIUM", 17: "MEDIUM",
  // LOW (Non-Blocking)
  6: "LOW", 10: "LOW", 11: "LOW", 12: "LOW", 13: "LOW", 14: "LOW", 15: "LOW", 18: "LOW", 19: "LOW"
};

/**
 * Checks if a given single error code should block user controls.
 */
export const shouldBlockCode = (errCode) => {
  if (!errCode || errCode === "0") return false;
  const code = parseInt(errCode, 10);
  const priority = ERROR_PRIORITIES[code];
  return priority === "MEDIUM" || priority === "HIGH" || priority === "CRITICAL";
};

/**
 * Evaluates an array or collection of active error codes.
 * Returns true if ANY active error is of MEDIUM, HIGH, or CRITICAL priority.
 */
export const shouldBlockControls = (activeCodes) => {
  if (!activeCodes) return false;
  
  // Handle single code (string or number)
  if (typeof activeCodes === 'string' || typeof activeCodes === 'number') {
    return shouldBlockCode(activeCodes);
  }

  // Handle array of codes
  if (Array.isArray(activeCodes)) {
    if (activeCodes.length === 0) return false;
    return activeCodes.some(code => shouldBlockCode(code));
  }

  return false;
};

/**
 * Determines if there is any blocking error among active codes.
 */
export const hasBlockingError = (codes) => {
  return shouldBlockControls(codes);
};
