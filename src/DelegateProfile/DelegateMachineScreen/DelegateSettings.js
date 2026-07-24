import React from "react";
import { FaCog } from "react-icons/fa";
import DelegateNavbar from "../DelegateNavbar/DelegateNavbar";
import "./DelegateUtilityPages.css";

const DelegateSettings = () => (
  <main className="delegate-utility-page">
    <section className="delegate-utility-card" aria-labelledby="delegate-settings-title">
      <div className="delegate-utility-icon" aria-hidden="true">
        <FaCog />
      </div>
      <h1 id="delegate-settings-title">Settings</h1>
      <p>Delegate equipment preferences and permitted controls will be available here.</p>
      <span className="delegate-utility-status">Coming soon</span>
    </section>
    <DelegateNavbar />
  </main>
);

export default DelegateSettings;