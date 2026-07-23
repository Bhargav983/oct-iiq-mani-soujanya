import React from "react";

const ConfirmationDialog = ({ title, children, confirmLabel, onConfirm, onCancel }) => (
  <div className="confirm-dialog-overlay">
    <div className="confirm-dialog">
      <div className="confirm-dialog-content">
        <h3>{title}</h3>
        {children}
        <div className="confirm-dialog-buttons">
          <button
            className="confirm-dialog-btn confirm-btn-yes"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            className="confirm-dialog-btn confirm-btn-no"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default ConfirmationDialog;
