import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaAngleLeft,
  FaCogs,
  FaCommentDots,
  FaEnvelope,
  FaHome,
  FaUserCircle,
} from "react-icons/fa";
import axios from "axios";
import "./DelegateNavbar.css";
import logo from "../../Logos/hvac-logo-new.jpg";
import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
import { AuthContext } from "../../Components/AuthContext/AuthContext";
import baseURL from "../../Components/ApiUrl/Apiurl";
import { shouldShowDelegateServiceSelector } from "./delegateNavbarRoutes";

const screens = [
  { label: "Dashboard", name: "/delegate-home", icon: <FaHome />, key: "dashboard" },
  { label: "Requests", name: "/delegate-display-request", icon: <FaEnvelope />, key: "requests" },
  { label: "Feedback", name: "/delegate-survey", icon: <FaCommentDots />, key: "feedback" },
  { label: "Monitor", name: "/delegate-machinescreen1", icon: <FaCogs />, key: "machinescreen1" },
];

const DelegateNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const showServiceSelector = shouldShowDelegateServiceSelector(location.pathname);
  const profileRef = useRef(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [serviceItemsList, setServiceItemsList] = useState([]);
  const { logout, user } = useContext(AuthContext);
  const {
    serviceItems,
    selectedServiceItem,
    serviceItemPermissions,
    updateSelectedServiceItem,
    loading,
  } = useDelegateServiceItems();

  useLayoutEffect(() => {
    document.body.classList.add("delegate-nav-active");
    document.body.classList.toggle("delegate-nav-with-selector", showServiceSelector);
    return () => {
      document.body.classList.remove("delegate-nav-active");
      document.body.classList.remove("delegate-nav-with-selector");
    };
  }, [showServiceSelector]);

  useEffect(() => {
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!showServiceSelector || !user?.company_id || !user?.delegate_id) {
      return undefined;
    }

    axios
      .get(`${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`)
      .then((response) => {
        if (cancelled) return;
        const data = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];
        setServiceItemsList(data);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Error fetching delegate service items:", error);
          setServiceItemsList([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showServiceSelector, user?.company_id, user?.delegate_id]);

  const getServiceItemName = (serviceItemId) => {
    const apiItem = serviceItemsList.find((item) => item.service_item_id === serviceItemId);
    if (apiItem) return apiItem.service_item_name || serviceItemId;
    const assignment = serviceItems.find((item) => item.service_item === serviceItemId);
    return assignment?.service_item_name || serviceItemId;
  };

  const isDisabled = (key) => {
    if (key === "dashboard") return false;
    if (key === "requests") return !serviceItemPermissions.can_raise_service_request;
    if (key === "feedback") {
      return !(
        serviceItemPermissions.can_submit_customer_satisfaction_survey &&
        serviceItemPermissions.can_log_customer_complaints
      );
    }
    if (key === "machinescreen1") return !serviceItemPermissions.can_monitor_equipment;
    return true;
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);
    await logout();
    navigate("/");
  };

  return (
    <>
      <header
        className={`delegate-top-navbar ${showServiceSelector ? "has-service-selector" : ""}`}
      >
        <div className="delegate-top-row">
          <button
            type="button"
            className="delegate-nav-icon-button delegate-nav-back"
            aria-label="Back to delegate monitor"
            onClick={() => navigate("/delegate-machinescreen1")}
          >
            <FaAngleLeft aria-hidden="true" />
          </button>

          <img src={logo} alt="AIR₂O" className="delegate-nav-logo" />

          <div className="delegate-nav-actions">
            {/* <button
              type="button"
              className="delegate-nav-icon-button"
              aria-label="Delegate notifications"
              onClick={() => alert("Notifications Clicked!")}
            >
              <FaBell aria-hidden="true" />
            </button> */}

            <div className="delegate-profile" ref={profileRef}>
              <button
                type="button"
                className="delegate-nav-icon-button"
                aria-label="Open delegate profile menu"
                aria-expanded={showProfileMenu}
                onClick={() => setShowProfileMenu((open) => !open)}
              >
                <FaUserCircle aria-hidden="true" />
              </button>

              {showProfileMenu && (
                <div className="delegate-profile-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigate("/delegate-profile-details")}
                  >
                    Profile
                  </button>
                  <button type="button" role="menuitem" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showServiceSelector && (
          <div className="delegate-service-selector">
            <label htmlFor="delegate-service-item">Assigned service item</label>
            <select
            id="delegate-service-item"
            value={selectedServiceItem || ""}
            onChange={(event) => updateSelectedServiceItem(event.target.value)}
            disabled={loading || serviceItems.length === 0}
          >
            <option value="">
              {loading ? "Loading service items..." : "Select Service Item"}
            </option>
            {serviceItems.map((item) => (
              <option key={item.service_item} value={item.service_item}>
                {getServiceItemName(item.service_item)}
              </option>
            ))}
            </select>
          </div>
        )}
      </header>

      <nav className="delegate-bottom-navbar" aria-label="Delegate navigation">
        {screens.map((item) => {
          const disabled = isDisabled(item.key);
          return (
            <button
              type="button"
              key={item.name}
              className={`delegate-bottom-nav-item ${location.pathname === item.name ? "is-active" : ""}`}
              disabled={disabled}
              onClick={() => !disabled && navigate(item.name)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default DelegateNavbar;