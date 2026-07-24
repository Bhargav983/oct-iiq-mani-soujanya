// import React from "react";
// import { useNavigate } from "react-router-dom";

// const Settings = () => {
//   const navigate = useNavigate();

//   return (
//     <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-light text-center p-3">
//       {/* Title */}
//       <h1 className="fw-bold mb-4">Settings</h1>

//       {/* Back Button */}
//       <button
//         onClick={() => navigate(-1)}
//         className="btn btn-primary px-4 py-2"
//       >
//         Back
//       </button>
//     </div>
//   );
// };

// export default Settings;


import React from "react";
import { useNavigate } from "react-router-dom";
import NavScreen from "../../../Components/Screens/Navbar/Navbar";

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div style={{ background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)", minHeight: "100vh" }}>
      <div className="machine-placeholder-content">
        <div style={{
          padding: '0px',
          maxWidth: '800px',
          margin: '0 auto',
          position: 'relative',
          flex: '1'
        }}>
          <div className="d-flex flex-column justify-content-center align-items-center text-center p-3" style={{ height: 'calc(100vh - 160px)' }}>
            <h1 className="fw-bold mb-4" style={{ color: 'white' }}>Settings</h1>
            
            <button
              onClick={() => navigate(-1)}
              className="btn btn-primary px-4 py-2"
              style={{
                backgroundColor: 'white',
                color: '#2B7ED6',
                border: 'none',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f0f0f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              Back
            </button>
          </div>
        </div>
        
        <NavScreen />
      </div>
    </div>
  );
};

export default Settings;