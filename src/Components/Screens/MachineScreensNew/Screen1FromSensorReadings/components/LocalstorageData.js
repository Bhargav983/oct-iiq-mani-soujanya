import React from "react";

const LocalstorageData = () => {
  const activeMachineParameters = localStorage.getItem(
    "active_machine_parameters"
  );

  let machineData = null;

  try {
    machineData = activeMachineParameters
      ? JSON.parse(activeMachineParameters)
      : null;
  } catch (error) {
    console.error("Failed to parse active_machine_parameters:", error);
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Active Machine Parameters</h2>

      {!machineData ? (
        <p>No active machine parameters found.</p>
      ) : (
        <div>
          {Object.entries(machineData).map(([key, value]) => (
            <div
              key={key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 15px",
                marginBottom: "8px",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <strong>{key}</strong>

              <span>
                {value === null ? "null" : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocalstorageData;