import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiClock } from 'react-icons/fi';
import baseURL from '../../Components/ApiUrl/Apiurl';
import DelegateNavbar from "../DelegateNavbar/DelegateNavbar";
import FullScreenLoader from '../../Common/FullScreenLoader';

const DelegateAlarmsPage = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const [errorData, setErrorData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  
  const filteredData = errorData.filter((item) => {
    // Priority filter
    if (priorityFilter !== "ALL" && item.priority !== priorityFilter) {
      return false;
    }
  
    // Date filter
    const itemDate = new Date(item.original_timestamp);
  
    if (fromDate && new Date(fromDate) > itemDate) {
      return false;
    }
  
    if (toDate && new Date(toDate) < itemDate) {
      return false;
    }
  
    return true;
  });
  

  // Get alarm data passed from navigation
  const alarmData = location.state?.alarmData || {
    alarmOccurred: '0',
    errorCount: 0,
    deviceId: ''
  };
  
  // Get user and company IDs separately
  const userId = location.state?.userId || null;
  const companyId = location.state?.company_id || null;

  useEffect(() => {
    const fetchErrorData = async () => {
      try {
        if (!alarmData.deviceId) {
          throw new Error('No device ID available');
        }

        const response = await fetch(
          `${baseURL}/errors/${alarmData.deviceId}/?user_id=${userId}&company_id=${companyId}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch error data');
        }

        const data = await response.json();
        
        if (data.status !== "success") {
          throw new Error(data.message || 'Error in response data');
        }

        setErrorData(data.data || []);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching error data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchErrorData();
  }, [alarmData.deviceId, userId, companyId]);

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'HIGH':
        return {
          backgroundColor: '#aae3ac',
          color: 'green',
          boxShadow: '0 2px 4px rgba(255, 68, 68, 0.3)'
        };
      case 'MEDIUM':
        return {
          backgroundColor: '#ff9800',
          color: 'white',
          boxShadow: '0 2px 4px rgba(255, 152, 0, 0.3)'
        };
      case 'LOW':
        return {
          backgroundColor: '#e7b7b7',
          color: 'red',
          boxShadow: '0 2px 4px rgba(76, 175, 80, 0.3)'
        };
      default:
        return {
          backgroundColor: '#9e9e9e',
          color: 'white',
          boxShadow: '0 2px 4px rgba(158, 158, 158, 0.3)'
        };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';

    const date = new Date(dateString);

    let day = date.getUTCDate().toString().padStart(2, '0');
    let month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    let year = date.getUTCFullYear();

    let hours = date.getUTCHours();
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');

    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  };

  const sendMachineAlert = async (errorItem) => {
    try {
      navigate("/delegate-Machine-request", {
        state: {
          pcb_serial_number: alarmData.deviceId,
          autoErrorCode: errorItem.error_code,  
          autoDescription: errorItem.description,
          alarmData: alarmData,
          userId: userId,
          company_id: companyId
        },
      });
    } catch (err) {
      console.error("Navigation error:", err);
      alert("Unable to process machine alert: " + err.message);
    }
  };

  return (
    <div style={{ background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)", height: "100vh" }}>
      <div className="delegate-card-container">
        {loading && <FullScreenLoader />}

        <div style={{
          padding: '0px',
          maxWidth: '800px',
          margin: '0 auto',
          position: 'relative',
          flex: '1'
        }}>
          {/* Current Alarm Status */}
          <div style={{ margin: '20px 10px' }}>
            {alarmData.alarmOccurred !== '0' ? (
              <div style={{
                padding: '2px',
                backgroundColor: 'white',
                borderRadius: '12px',
                marginBottom: '20px'
              }}>
                <h3 style={{ color: 'red', marginTop: 0, marginBottom: 2 }}>Current Alarm Status</h3>
                <p style={{ marginBottom: 0 }}><strong>Device ID:&nbsp;{alarmData.deviceId}</strong> </p>
                <p><strong>Active Alarm Code:&nbsp;{alarmData.alarmOccurred}</strong></p>
              </div>
            ) : (
              <div style={{
                padding: '2px',
                backgroundColor: 'white',
                borderRadius: '12px',
                marginBottom: '20px'
              }}>
                <h3 style={{
                  background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  marginTop: 0,
                  marginBottom: 2
                }}>
                  Current Alarm Status
                </h3>
                <p style={{ marginBottom: 0 }}><strong>Device ID:&nbsp;{alarmData.deviceId}</strong> </p>
                <p>No active alarms - System is operating normally</p>
              </div>
            )}
          </div>

          <div className="history-classname" style={{ backgroundColor: "white" }}>
            {/* Historical Errors */}
            <h3 className='historical-error-logs-heading-mobile-view'>Historical Error Logs</h3>

            <div style={{
              display: "flex",
              gap: "10px",
              marginBottom: "15px",
              flexWrap: "wrap"
            }}>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{ padding: "8px", borderRadius: "5px", border: "1px solid #ddd", marginLeft: "4px",  marginRight: "4px" }}
              >
                <option value="ALL">All Priority</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{
                  padding: "8px",
                  borderRadius: "5px",
                  border: "1px solid #ddd",
                  flex: "1",
                  minWidth: "0",
                 marginLeft: "4px"

                }}
              />

              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{
                  padding: "8px",
                  borderRadius: "5px",
                  border: "1px solid #ddd",
                  flex: "1",
                  minWidth: "0",
                 marginRight: "4px"

                }}
              />

              <button
                onClick={() => {
                  setPriorityFilter("ALL");
                  setFromDate("");
                  setToDate("");
                }}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#f0f0f0",
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#333",
                  marginRight: "4px"

                }}
              >
                Reset
              </button>
            </div>

            {loading ? (
              <div>Loading error history...</div>
            ) : error ? (
              <div style={{ color: 'red' }}>Error: {error}</div>
            ) : errorData.length === 0 ? (
              <div className="delegate-card-empty-message">No historical errors found</div>
            ) : (
              <div style={{
                maxHeight: '500px',
                overflowY: 'auto',
                overflowX: 'auto',
                border: '1px solid #eee',
                borderRadius: '8px'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '800px'
                }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#f5f5f5' }}>
                    <tr>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontWeight: "600",
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e0e0e0'
                      }}>S.No</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontWeight: "600",
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Error Code</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontWeight: "600",
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Description</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontWeight: "600",
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Priority</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontWeight: "600",
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Occurred At</th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        background: "linear-gradient(to bottom, #3E99ED, #2B7ED6)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontWeight: "600",
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Machine Alert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((error, index) => (
                      <tr
                        key={index}
                        style={{
                          borderBottom: '1px solid #f0f0f0',
                          backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#fafafa';
                        }}
                      >
                        <td style={{ padding: '12px', whiteSpace: 'nowrap', color: '#666' }}>{index + 1}</td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap', fontWeight: '500', color: '#333' }}>{error.error_code}</td>
                        <td style={{ padding: '12px', color: '#555' }}>{error.description}</td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            letterSpacing: '0.5px',
                            display: 'inline-block',
                            whiteSpace: 'nowrap',
                            ...getPriorityStyle(error.priority)
                          }}>
                            {error.priority}
                          </span>
                        </td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{formatDate(error.original_timestamp)}</td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => sendMachineAlert(error)}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: '#2196f3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#1976d2';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#2196f3';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                            }}
                          >
                            Send Machine Alert
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DelegateNavbar />
      </div>
    </div>
  );
};

export default DelegateAlarmsPage;




