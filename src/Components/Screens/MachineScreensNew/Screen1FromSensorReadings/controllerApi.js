const CONTROLLER_URL = "https://mdata.air2o.net/controllers/";

export const sendRefreshCommand = async (pcbSerialNumber, sensorData) => {
  const payload = {
    Header: "0xAA",
    DI: pcbSerialNumber || "2411GM-0102",
    MD: sensorData.mode || "3",
    FS: sensorData.fanSpeed || "0",
    SRT: sensorData.temperature || 25,
    HVAC: "3",
    Footer: "0xZX",
  };

  console.group("Refresh command");
  console.log("Payload:", payload);
  console.groupEnd();

  try {
    const response = await fetch(CONTROLLER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error:
          responseBody?.error ||
          responseBody?.message ||
          "Command rejected by server",
        status: response.status,
      };
    }

    return { success: true, data: responseBody };
  } catch {
    return { success: false, error: "Network error or server unreachable" };
  }
};
