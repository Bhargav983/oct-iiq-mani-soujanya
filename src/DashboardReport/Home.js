import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from "../Components/AuthContext/AuthContext";
import NavScreen from "../Components/Screens/Navbar/Navbar";
import baseURL from "../Components/ApiUrl/Apiurl";
import "./Home.css";
import { useNavigate } from "react-router-dom";


const Home = () => {
  const { user } = useContext(AuthContext);
  const userId = user?.customer_id;

  const [serviceCount, setServiceCount] = useState(0);
  const [delegateCount, setDelegateCount] = useState(0);
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await fetch(`${baseURL}/service-pools/?user_id=${userId}&company_id=${user?.company_id}`);
        if (response.ok) {
          const result = await response.json();
          const services = result.data || [];
          const filteredServices = services.filter(service => service.customer === userId);
          setServiceCount(filteredServices.length);
        }
      } catch (error) {
        console.error("Error fetching services:", error);
      }
    };

    const fetchDelegates = async () => {
      try {
        const response = await fetch(`${baseURL}/delegates/`);
        if (response.ok) {
          const result = await response.json();
          const delegates = result.data || [];
          const filteredDelegates = delegates.filter(delegate => delegate.customer === userId);
          setDelegateCount(filteredDelegates.length);
        }
      } catch (error) {
        console.error("Error fetching delegates:", error);
      }
    };

   const fetchCustomerUsername = async () => {
  try {
    const response = await fetch(
      `${baseURL}/customers/${userId}/?user_id=${userId}&company_id=${user?.company_id}`
    );

    if (response.ok) {
      const result = await response.json();
      const customer = result.data; // It's a single object, not an array

      if (customer && customer.username) {
        setUsername(customer.username);
        console.log("Fetched username:", customer.username);
      } else {
        console.warn("Customer not found or missing username");
      }
    } else {
      console.error("Failed to fetch customer:", response.status);
    }
  } catch (error) {
    console.error("Error fetching customer username:", error);
  }
};


    if (userId) {
      fetchServices();
      fetchDelegates();
      fetchCustomerUsername();
    }
  }, [userId]);

  return (
    <div className="home">
      {username && <h2 className="welcome-text">Hey, {username}</h2>}
      
      <div className="card-container">
        {/* First Card → Navigate to /request */}
        <div 
          className="info-card" 
          onClick={() => navigate("/request")}
          style={{ cursor: "pointer" }}
        >
          <h3>My Services</h3>
          <p>{serviceCount}</p>
        </div>

        {/* Second Card → Navigate to /delegates */}
        <div 
          className="info-card" 
          onClick={() => navigate("/view-delegates")}
          style={{ cursor: "pointer" }}
        >
          <h3>My Delegates</h3>
          <p>{delegateCount}</p>
        </div>
      </div>

      <NavScreen />
    </div>
  );
};

export default Home;
