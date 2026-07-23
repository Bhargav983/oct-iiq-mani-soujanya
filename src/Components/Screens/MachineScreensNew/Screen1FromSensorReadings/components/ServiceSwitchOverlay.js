import React from "react";

const ServiceSwitchOverlay = ({ message, progress }) => (
  <div className="service-switching-overlay">
    <div className="service-switching-content">
      <div className="switching-spinner" />
      <p className="switching-message">{message}</p>
      <div className="switching-progress-bar">
        <div className="switching-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  </div>
);

export default ServiceSwitchOverlay;
