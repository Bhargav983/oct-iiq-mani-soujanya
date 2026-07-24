// import React from "react";
// import { useNavigate } from "react-router-dom";

// const Timers = () => {
//   const navigate = useNavigate();

//   return (
//     <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-light text-center p-3">
//       {/* Title */}
//       <h1 className="fw-bold mb-4">Timers</h1>

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

// export default Timers;



import React from "react";
import NavScreen from "../../../Components/Screens/Navbar/Navbar";

const Timers = () => {
  return (
    <div style={{ background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)", height: "100vh" }}>
      <div className="machine-placeholder-content">
        <div style={{
          padding: '0px',
          maxWidth: '800px',
          margin: '0 auto',
          position: 'relative',
          flex: '1'
        }}>
          {/* Coming Soon Content */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: 'calc(100vh - 160px)',
            textAlign: 'center'
          }}>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              background: "white",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "white"
            }}>
              Timers
            </h1>
            
            <h2 style={{
              fontSize: '1.5rem',
              color: 'white',
              opacity: 0.9
            }}>
              Coming Soon!
            </h2>
          </div>
        </div>
        
        <NavScreen />
      </div>
    </div>
  );
};

export default Timers;