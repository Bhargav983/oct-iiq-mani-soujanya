const DEFAULT_API_URL = "https://testhvacoctane.air2o.net";

// Keep the host explicit in browser Network/Console entries.
const baseURL = process.env.REACT_APP_API_BASE_URL || DEFAULT_API_URL;

export default baseURL;
