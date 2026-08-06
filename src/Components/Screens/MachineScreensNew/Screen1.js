import { lazy } from "react";
import "./Screen1.css";

const dataSource = process.env.REACT_APP_MACHINE_DATA_SOURCE || "events";

const Screen1 = lazy(() =>
  dataSource === "sensor-readings"
    ? import("./Screen1FromSensorReadings/Screen1FromSensorReadings")
    : import("./Screen1FromEvents/Screen1FromEvents")
);
 
export default Screen1;