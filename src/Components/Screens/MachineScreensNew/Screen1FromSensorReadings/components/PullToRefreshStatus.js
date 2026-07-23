import React from "react";
import { FiRefreshCw } from "react-icons/fi";

const PullToRefreshStatus = ({ pullToRefresh, threshold, rotation, opacity }) => {
  const isVisible = pullToRefresh.isPulling || pullToRefresh.isRefreshing;
  if (!isVisible) return null;

  return (
    <>
      <div className="pull-refresh-blocking-overlay" />
      <div className="pull-refresh-popup">
        {pullToRefresh.isRefreshing ? (
          <>
            <div className="screen1-refresh-spinner" />
            <span>Sending refresh command...</span>
          </>
        ) : (
          <>
            <FiRefreshCw
              size={18}
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: "transform 0.2s ease",
                opacity,
              }}
            />
            <span>
              {pullToRefresh.pullDistance >= threshold
                ? "Release to refresh"
                : "Pull down to refresh"}
            </span>
          </>
        )}
      </div>
    </>
  );
};

export default PullToRefreshStatus;
