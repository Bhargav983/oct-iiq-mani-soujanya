import React, { useState, useRef, useContext } from 'react';
import './Login.css';
import { FaUser, FaLock } from 'react-icons/fa';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import logo from '../../Logos/hvac-logo-new.jpg';
import greenaire from '../../Logos/greenAire.png';
import axios from "axios";
import { AuthContext } from "../AuthContext/AuthContext";
import baseURL from '../ApiUrl/Apiurl';

export default function Login() { 
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef();
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  // const handleLogin = async (e) => {
  //   e.preventDefault();
  //   setError('');
  //   setIsLoading(true);

  //   try {
  //     let fcmToken = '';
  //     if (window.ReactNativeWebView && window.fcmToken) {
  //       fcmToken = window.fcmToken;
  //     }

  //     const response = await axios.post(`${baseURL}/customer-login/`, {
  //       mobile,
  //       password,
  //       fcm_token: fcmToken,
  //     });

  //     const loginResponse = {
  //       status: "success",
  //       message: "Login successful",
  //       data: response.data.data
  //     };

  //     localStorage.setItem("user", JSON.stringify(loginResponse));

  //     const user = loginResponse.data;
  //     const sessionId = user.session_id; // ✅

  //     localStorage.setItem("userId", user.customer_id || user.delegate_id);
  //     localStorage.setItem("userMobile", user.mobile);
  //     localStorage.setItem("userName", user.full_name || user.delegate_name);
  //     localStorage.setItem("customerType", user.customer_type || "delegate");
  //     localStorage.setItem("isLoggedIn", "true");
  //     localStorage.setItem("session_id", sessionId); // ✅

  //     login(user);

  //     if (window.ReactNativeWebView) {
  //       window.ReactNativeWebView.postMessage(JSON.stringify(loginResponse));
  //     }

  //     // Determine the original destination path
  //     let destinationPath = "/machinescreen1";
  //     let destinationState = { userMobile: user.mobile };

  //     if (user.delegate_id) {
  //       try {
  //         const serviceItemsResponse = await axios.get(`${baseURL}/delegate-service-item-tasks/`);
  //         const allDelegateItems = serviceItemsResponse.data.data || [];
  //         const userServiceItems = allDelegateItems.filter(
  //           item => item.delegate === user.delegate_id
  //         );
  //         const hasMonitorPermission = userServiceItems.some(
  //           item => item.can_monitor_equipment === true
  //         );

  //         destinationPath = hasMonitorPermission
  //           ? "/delegate-machinescreen1"
  //           : "/delegate-home";

  //       } catch (serviceError) {
  //         console.error("Error fetching service items:", serviceError);
  //         destinationPath = "/delegate-home";
  //       }
  //     }

  //     // Always navigate to /staticscreen, passing the resolved destination
  //     navigate("/staticscreen", {
  //       state: {
  //         userMobile: user.mobile,
  //         destinationPath,
  //         destinationState,
  //       }
  //     });

  //   } catch (err) {
  //     console.error("Login error:", err);
  //     setError("Invalid mobile number or password");
  //   }

  //   setIsLoading(false);
  // };

  const handleLogin = async (e) => {
  e.preventDefault();
  setError('');
  setIsLoading(true);

  try {
    let fcmToken = '';
    if (window.ReactNativeWebView && window.fcmToken) {
      fcmToken = window.fcmToken;
    }

    const response = await axios.post(
      `${baseURL}/customer-login/`,
      {
        mobile,
        password,
        fcm_token: fcmToken,
      },
      { timeout: 120000 }
    );

    const loginResponse = {
      status: "success",
      message: "Login successful",
      data: response.data.data
    };

    localStorage.setItem("user", JSON.stringify(loginResponse));

    const user = loginResponse.data;
    const sessionId = user.session_id;

    localStorage.setItem("userId", user.customer_id || user.delegate_id);
    localStorage.setItem("userMobile", user.mobile);
    localStorage.setItem("userName", user.full_name || user.delegate_name);
    localStorage.setItem("customerType", user.customer_type || "delegate");
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("session_id", sessionId);

    login(user);

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(loginResponse));
    }

    // Determine the original destination path
    let destinationPath = "/machinescreen1";
    let destinationState = { userMobile: user.mobile };

    if (user.delegate_id) {
      try {
        const serviceItemsResponse = await axios.get(`${baseURL}/delegate-service-item-tasks/`);
        const allDelegateItems = serviceItemsResponse.data.data || [];
        const userServiceItems = allDelegateItems.filter(
          item => item.delegate === user.delegate_id
        );
        sessionStorage.setItem(
          "delegateServiceItemAssignments",
          JSON.stringify({
            delegateId: user.delegate_id,
            items: userServiceItems,
          })
        );
        const hasMonitorPermission = userServiceItems.some(
          item => item.can_monitor_equipment === true
        );

        destinationPath = hasMonitorPermission
          ? "/delegate-machinescreen1"
          : "/delegate-home";

      } catch (serviceError) {
        console.error("Error fetching service items:", serviceError);
        destinationPath = "/delegate-home";
      }
    }

    // FIX: For WebView, use window.location instead of navigate
    if (window.ReactNativeWebView) {
      // Store data in sessionStorage for WebView
      sessionStorage.setItem('staticScreenData', JSON.stringify({
        destinationPath,
        destinationState,
        userMobile: user.mobile
      }));
      
      // Use window.location for WebView navigation
      window.location.href = '/staticscreen';
    } else {
      // For browser, use React Router navigate with state
      navigate("/staticscreen", {
        state: {
          userMobile: user.mobile,
          destinationPath,
          destinationState,
        }
      });
    }

  } catch (err) {
    console.error("Login error:", err);
    setError(
      err.code === "ECONNABORTED"
        ? "The server is taking longer than usual. Please try again."
        : "Invalid mobile number or password"
    );
  }

  setIsLoading(false);
};

  return (
    <>
      {isLoading && (
        <div className="fullLoaderOverlay">
          <div className="fullLoader"></div>
        </div>
      )}

      <div className="login-page">
        <div className="login-card">
          <div className="logoContainer">
            <img src={logo} alt="AIRO Logo" className="logo" />
          </div>

          <h2 className="welcome">WELCOME BACK!</h2>
          <p className="subtitle">Please login to your account</p>

          <form onSubmit={handleLogin}>
            <div className="inputWrapper">
              <FaUser className="icon" />
              <input
                type="tel"
                placeholder="Enter Mobile Number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') passwordRef.current.focus();
                }}
              />
            </div>

            <div className="inputWrapper">
              <FaLock className="icon" />
              <input
                type={secureText ? 'password' : 'text'}
                placeholder="Enter Password"
                value={password}
                ref={passwordRef}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span onClick={() => setSecureText(!secureText)} className="eyeIcon">
                {secureText ? <FiEye /> : <FiEyeOff />}
              </span>
            </div>

            <div className="checkboxContainer">
              <span className="forgot" onClick={() => navigate('/security')}>Forgot Password?</span>
            </div>

            {error && <p className="errorText">{error}</p>}

            <button 
              type="submit" 
              className="loginButton shadow"
              disabled={isLoading}
            >
              LOGIN
            </button>

            <p className="orText">Or</p>

            <p className="registerText">
              Already purchased a product?{' '}
              <span className="registerLink" onClick={() => navigate('/signup')}>
                Set your password
              </span>
            </p>

            <p className="registerText">
              Not a customer yet?{' '}
              <span className="registerLink" onClick={() => navigate('/contact')}>
                Contact Us
              </span>
            </p>

            <img src={greenaire} alt="Green Aire" className="footerLogo" />
          </form>
        </div>
      </div>
    </>
  );
}