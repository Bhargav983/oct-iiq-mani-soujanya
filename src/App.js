import React, { Suspense, lazy, useContext, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, useNavigate } from "react-router-dom";
import Login from "./Components/LoginSreens/Login";
import Screen1 from "./Components/Screens/MachineScreensNew/Screen1";
import DelegateScreen1 from "./DelegateProfile/DelegateMachineScreen/DelegateScreen1";
import AuthProvider, { AuthContext } from "./Components/AuthContext/AuthContext";
import { DelegateServiceItemProvider } from "./Components/AuthContext/DelegateServiceItemContext";
import { CustomerNotificationProvider } from "./Components/AuthContext/CustomerNotificationContext";
import { SnackbarProvider } from "notistack";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const SetPasswordScreen = lazy(() => import("./Components/LoginSreens/SetPasswordScreen"));
const ForgotPasswordScreen = lazy(() => import("./Components/LoginSreens/ForgotPasswordScreen"));
const OTPVerificationScreen = lazy(() => import("./Components/LoginSreens/OTPVerificationScreen"));
const SecurityQuestionsScreen = lazy(() => import("./Components/LoginSreens/SecurityQuestionsScreen"));
const SignUpScreen = lazy(() => import("./Components/LoginSreens/SignUpScreen"));
const SignupSetPassword = lazy(() => import("./Components/LoginSreens/SignupSetPassword"));
const CustomerData = lazy(() => import("./Components/LoginSreens/CusotmerData"));
const DelegateData = lazy(() => import("./Components/LoginSreens/DelegateData"));
const DelegateSignup = lazy(() => import("./Components/LoginSreens/DelegateSignup"));
const Contact = lazy(() => import("./Components/LoginSreens/Contact"));

const Dashboard = lazy(() => import("./Components/Screens/Dashboard"));
const Navbar = lazy(() => import("./Components/Screens/Navbar/Navbar"));
const DashboardScreen = lazy(() => import("./Components/Screens/DashboardScreen/Dashboard"));
const MachineScreen = lazy(() => import("./Components/Screens/MachineScreen/Machine"));
const MachineDataScreen = lazy(() => import("./Components/Screens/MachineScreen/MachineDataScreen"));
const RequestScreen = lazy(() => import("./Components/Screens/RequestScreen/Request"));
const ComplaintForm = lazy(() => import("./Components/Screens/Complaints/ComplaintsForm"));
const ComplaintDetails = lazy(() => import("./Components/Screens/Complaints/ComplaintDetails"));
const FeedbackScreen = lazy(() => import("./Components/Screens/FeedbackScreen/Feedback"));
const FeedbackDetails = lazy(() => import("./Components/Screens/FeedbackScreen/FeedbackDetails"));
const ServiceRequestForm = lazy(() => import("./Components/Screens/ServiceRequest/ServiceRequestForm"));
const ViewDelegates = lazy(() => import("./Components/Screens/Delegates/ViewDelegates"));
const AddDelegates = lazy(() => import("./Components/Screens/Delegates/AddDelegates"));
const Home = lazy(() => import("./DashboardReport/Home"));
const EditCustomer = lazy(() => import("./Components/Screens/DashboardScreen/EditCustomer"));
const MachineDetails = lazy(() => import("./Components/Screens/MachineScreen/MachineDetails"));
const DelegateSetviceItems = lazy(() => import("./Components/Screens/Delegates/DelegateSetviceItems"));
const Connect = lazy(() => import("./Components/Screens/Connect/Connect"));
const DisplayFeedback = lazy(() => import("./Components/Screens/FeedbackScreen/DisplayFeedback"));
const Screen2 = lazy(() => import("./Components/Screens/MachineScreensNew/Screen2"));
const AlarmsPage = lazy(() => import("./Components/Screens/MachineScreensNew/AlarmsPage"));
const Settings = lazy(() => import("./Components/Screens/MachineScreensNew/Settings"));
const Timers = lazy(() => import("./Components/Screens/MachineScreensNew/Timers"));
const MachineRequestForm = lazy(() => import("./Components/Screens/MachineScreensNew/MachineRequestForm"));
const MachineLayout = lazy(() => import("./Components/Screens/MachineScreensNew/MachineLayout"));
const WifiInstructionsScreen = lazy(() => import("./Components/Screens/WifiInstructionsScreen"));
const StaticScreen = lazy(() => import("./Components/Screens/StaticScreen"));
const WifiScreen = lazy(() => import("./Components/Screens/WifiScreen"));

const DelegateHome = lazy(() => import("./DelegateProfile/DelegateHome/DelegateHome"));
const DelegateRequestForm = lazy(() => import("./DelegateProfile/DelegateRequest/DelegateRequestForm"));
const DelegateSurveyForm = lazy(() => import("./DelegateProfile/DelegateSurvey/DelegateSurveyForm"));
const RequestScreenDelegate = lazy(() => import("./DelegateProfile/DelegateRequest/RequestScreenDelegate"));
const DelegateFeedback = lazy(() => import("./DelegateProfile/DelegateRequest/DelegateFeedback"));
const DelegateProfileDetails = lazy(() => import("./DelegateProfile/DelegateProfileDetails/ProfileDetails"));
const DelegateComplaintsForm = lazy(() => import("./DelegateProfile/DelegateRequest/DelegateComplaintsForm"));
const DelegateScreen2 = lazy(() => import("./DelegateProfile/DelegateMachineScreen/DelegateScreen2"));
const DelegateAlarmsPage = lazy(() => import("./DelegateProfile/DelegateMachineScreen/DelegateAlarmPage"));
const DelegateMachineAlert = lazy(() => import("./DelegateProfile/DelegateMachineScreen/DelegateMachineAlert"));
const DelegateTimers = lazy(() => import("./DelegateProfile/DelegateMachineScreen/DelegateTimers"));
const DelegateSettings = lazy(() => import("./DelegateProfile/DelegateMachineScreen/DelegateSettings"));

function AppRouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        color: "white",
        background: "linear-gradient(180deg, #3e99ed 0%, #2b7ed6 100%)",
        textAlign: "center",
      }}
    >
      <div>
        <div className="app-route-spinner" aria-hidden="true" />
        <h2 style={{ margin: "0 0 10px", fontSize: "22px" }}>Loading AIR₂O</h2>
        <p style={{ margin: 0, fontSize: "15px", opacity: 0.94 }}>
          Please wait while we prepare this screen.
        </p>
      </div>
    </div>
  );
}

function CustomerNotificationProviderWrapper({ children }) {
  const { user } = useContext(AuthContext);

  return (
    <CustomerNotificationProvider
      customerId={user?.customer_id}
      companyId={user?.company_id}
    >
      {children}
    </CustomerNotificationProvider>
  );
}

function CustomerRoutes() {
  return <MachineLayout />;
}

function AppWrapper() {
  const navigate = useNavigate();

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    if (isLoggedIn === "true" && window.location.pathname === "/") {
      navigate("/machinescreen1");
    }
  }, [navigate]);

  return <Login />;
}

function App() {
  return (
    <AuthProvider>
      <DelegateServiceItemProvider>
        <CustomerNotificationProviderWrapper>
          <SnackbarProvider
            maxSnack={3}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            autoHideDuration={4000}
          >
            <Router>
              <div className="App">
                <ToastContainer
                  position="top-right"
                  autoClose={5000}
                  newestOnTop
                  pauseOnHover
                  draggable
                />

                <Suspense fallback={<AppRouteLoading />}>
                  <Routes>
                    <Route path="/" element={<AppWrapper />} />

                    <Route element={<CustomerRoutes />}>
                      <Route path="/machinescreen1" element={<Screen1 />} />
                      <Route path="/machinescreen2" element={<Screen2 />} />
                      <Route path="/alarms" element={<AlarmsPage />} />
                      <Route path="/timers" element={<Timers />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/machine-service-request-form" element={<MachineRequestForm />} />
                      <Route path="/machine" element={<MachineScreen />} />
                      <Route path="/home" element={<Home />} />
                      <Route path="/request" element={<RequestScreen />} />
                      <Route path="/view-delegates" element={<ViewDelegates />} />
                      <Route path="/service-form" element={<ServiceRequestForm />} />
                    </Route>

                    <Route path="/setpassword" element={<SetPasswordScreen />} />
                    <Route path="/forgotpassword" element={<ForgotPasswordScreen />} />
                    <Route path="/otp" element={<OTPVerificationScreen />} />
                    <Route path="/security" element={<SecurityQuestionsScreen />} />
                    <Route path="/signup" element={<SignUpScreen />} />
                    <Route path="/set-sign-password" element={<SignupSetPassword />} />
                    <Route path="/set-delegate-sign-password" element={<DelegateSignup />} />
                    <Route path="/customer-data" element={<CustomerData />} />
                    <Route path="/delegate-data" element={<DelegateData />} />
                    <Route path="/customer-dashboard" element={<Dashboard />} />
                    <Route path="/navbar" element={<Navbar />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/dashboard" element={<DashboardScreen />} />
                    <Route path="/connect" element={<Connect />} />
                    <Route path="/staticscreen" element={<StaticScreen />} />
                    <Route path="/wifi-screen" element={<WifiScreen />} />
                    <Route path="/wifi-instructions" element={<WifiInstructionsScreen />} />
                    <Route path="/machine-data" element={<MachineDataScreen />} />
                    <Route path="/complaint-form" element={<ComplaintForm />} />
                    <Route path="/complaint-details" element={<ComplaintDetails />} />
                    <Route path="/feedback/:requestId" element={<FeedbackScreen />} />
                    <Route path="/feedback-details" element={<FeedbackDetails />} />
                    <Route path="/delegate-feedback/:requestId" element={<DelegateFeedback />} />
                    <Route path="/display-feedback" element={<DisplayFeedback />} />
                    <Route path="/add-delegates" element={<AddDelegates />} />
                    <Route path="/edit-customer/:customer_id" element={<EditCustomer />} />
                    <Route path="/machines/:serviceItemId" element={<MachineDetails />} />
                    <Route path="/delegate-service-items/:delegateId" element={<DelegateSetviceItems />} />
                    <Route path="/delegate-home" element={<DelegateHome />} />
                    <Route path="/delegate-machinescreen1" element={<DelegateScreen1 />} />
                    <Route path="/delegate-machinescreen2" element={<DelegateScreen2 />} />
                    <Route path="/delegate-alarms" element={<DelegateAlarmsPage />} />
                    <Route path="/delegate-Machine-request" element={<DelegateMachineAlert />} />
                    <Route path="/delegate-timers" element={<DelegateTimers />} />
                    <Route path="/delegate-settings" element={<DelegateSettings />} />
                    <Route path="/delegate-request" element={<DelegateRequestForm />} />
                    <Route path="/delegate-display-request" element={<RequestScreenDelegate />} />
                    <Route path="/delegate-survey" element={<DelegateSurveyForm />} />
                    <Route path="/delegate-profile-details" element={<DelegateProfileDetails />} />
                    <Route path="/delegate-complaint-form" element={<DelegateComplaintsForm />} />
                  </Routes>
                </Suspense>
              </div>
            </Router>
          </SnackbarProvider>
        </CustomerNotificationProviderWrapper>
      </DelegateServiceItemProvider>
    </AuthProvider>
  );
}

export default App;