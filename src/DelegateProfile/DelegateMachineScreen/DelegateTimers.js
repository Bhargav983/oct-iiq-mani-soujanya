import React from "react";
import { FaClock } from "react-icons/fa";
import DelegateNavbar from "../DelegateNavbar/DelegateNavbar";
import "./DelegateUtilityPages.css";

const DelegateTimers = () => (
  <main className="delegate-utility-page">
    <section className="delegate-utility-card" aria-labelledby="delegate-timers-title">
      <div className="delegate-utility-icon" aria-hidden="true">
        <FaClock />
      </div>
      <h1 id="delegate-timers-title">Timers</h1>
      <p>Delegate timer schedules and equipment automation will be available here.</p>
      <span className="delegate-utility-status">Coming soon</span>
    </section>
    <DelegateNavbar />
  </main>
);

export default DelegateTimers;