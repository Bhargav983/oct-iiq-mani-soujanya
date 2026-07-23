// components/Loading.js
import React from "react";
import { FiLogOut } from "react-icons/fi";

const Loading = ({
  onLogout,
  title = "Connecting to AIR₂O services",
  message = "Please wait while we load your machines.",
  retryLabel,
  onRetry,
}) => {
  return (
    <div
      className="mainmain-container"
      style={{
        backgroundImage: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        color: "white",
      }}
    >
      <div className="connection-loading-card" role="status" aria-live="polite">
        <div className="connection-loading-spinner" aria-hidden="true" />
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="connection-loading-actions">
          {onRetry && (
            <button className="connection-retry-button" onClick={onRetry}>
              {retryLabel || "Retry now"}
            </button>
          )}
          <button onClick={onLogout} className="connection-logout-button">
            <FiLogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Loading;