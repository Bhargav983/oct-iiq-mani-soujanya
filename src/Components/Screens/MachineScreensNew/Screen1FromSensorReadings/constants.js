export const MODE_MAP = {
  1: "IDEC",
  2: "Auto",
  3: "Fan",
  4: "Indirect",
  5: "Direct",
};

export const MODE_CODE_MAP = {
  IDEC: 1,
  Auto: 2,
  Fan: 3,
  Indirect: 4,
  Direct: 5,
};

export const FAN_SPEEDS = ["0", "1", "2"];
export const FAN_LABELS = ["High", "Medium", "Low"];

export const PULL_THRESHOLD = 80;
export const MAX_PULL = 120;

export const PROCESSING_MESSAGES = [
  "1/6 Sending request...",
  "2/6 Connecting to device...",
  "3/6 Applying changes...",
  "4/6 Syncing settings...",
  "5/6 Confirming status...",
  "6/6 Finalizing...",
];

export const SWITCHING_MESSAGES = [
  "Connecting to device...",
  "Fetching data from Machine...",
  "Processing device information...",
  "Updating system status...",
  "Finalizing connection...",
  "Connected successfully!",
];
