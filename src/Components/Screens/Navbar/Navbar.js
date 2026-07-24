import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaAngleLeft,
  FaBell,
  FaCogs,
  FaHome,
  FaInbox,
  FaPlus,
  FaUserCircle,
  FaUsers,
} from "react-icons/fa";
import "./Navbar.css";
import { AuthContext } from "../../AuthContext/AuthContext";
import CustomerBell from "./CustomerBell";
import logo from "../../../Logos/hvac-logo-new.jpg";

const screens = [
  { label: "Dashboard", name: "/home", icon: <FaHome /> },
  { label: "Machines", name: "/machine", icon: <FaCogs /> },
  { label: "Requests", name: "/request", icon: <FaUsers /> },
  { label: "Delegates", name: "/view-delegates", icon: <FaInbox /> },
];

const NavScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);
  const { logout, user } = useContext(AuthContext);

  useLayoutEffect(() => {
    document.body.classList.add("customer-nav-active");
    return () => document.body.classList.remove("customer-nav-active");
  }, []);

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

  const handleLogout = () => {
    setShowProfileMenu(false);
    logout();
    navigate("/");
  };

  return (
    <>
      <header className="customer-top-navbar">
        <button
          type="button"
          className="customer-nav-icon-button customer-nav-back"
          aria-label="Back to machine controls"
          onClick={() => navigate("/machinescreen1")}
        >
          <FaAngleLeft aria-hidden="true" />
        </button>

        <img src={logo} alt="AIR₂O" className="customer-nav-logo" />

        <div className="customer-nav-actions">
          <button
            type="button"
            className="customer-nav-icon-button customer-nav-home"
            aria-label="Machine controls"
            onClick={() => navigate("/machinescreen1")}
          >
            <FaHome aria-hidden="true" />
          </button>

          <div className="customer-nav-bell" aria-label="Notifications">
            {user?.customer_id ? <CustomerBell /> : <FaBell aria-hidden="true" />}
          </div>

          <div className="customer-profile" ref={profileRef}>
            <button
              type="button"
              className="customer-nav-icon-button"
              aria-label="Open profile menu"
              aria-expanded={showProfileMenu}
              onClick={() => setShowProfileMenu((open) => !open)}
            >
              <FaUserCircle aria-hidden="true" />
            </button>

            {showProfileMenu && (
              <div className="customer-profile-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => navigate("/dashboard")}>
                  Profile
                </button>
                <button type="button" role="menuitem" onClick={() => navigate("/connect")}>
                  Connect
                </button>
                <button type="button" role="menuitem" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="customer-bottom-navbar" aria-label="Customer navigation">
        {screens.slice(0, 2).map((item) => (
          <button
            type="button"
            key={item.name}
            className={`customer-bottom-nav-item ${location.pathname === item.name ? "is-active" : ""}`}
            onClick={() => navigate(item.name)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}

        <button
          type="button"
          className="customer-add-request"
          aria-label="Create service request"
          onClick={() => navigate("/service-form")}
        >
          <FaPlus aria-hidden="true" />
        </button>

        {screens.slice(2).map((item) => (
          <button
            type="button"
            key={item.name}
            className={`customer-bottom-nav-item ${location.pathname === item.name ? "is-active" : ""}`}
            onClick={() => navigate(item.name)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};

export default NavScreen;