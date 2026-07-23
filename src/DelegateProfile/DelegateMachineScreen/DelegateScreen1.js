import { lazy } from "react";

const useSensorReadings =
  process.env.REACT_APP_MACHINE_DATA_SOURCE === "sensor-readings";

const DelegateScreen1 = lazy(() =>
  useSensorReadings
    ? import("./DelegateScreen1FromSensorReadings")
    : import("./DelegateScreen1FromEvents")
);

export default DelegateScreen1;