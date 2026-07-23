import Screen1FromEvents from "./Screen1FromEvents/Screen1FromEvents";
import Screen1FromSensorReadings from "./Screen1FromSensorReadings/Screen1FromSensorReadings";

const dataSource = process.env.REACT_APP_MACHINE_DATA_SOURCE || "events";

const Screen1 =
  dataSource === "sensor-readings"
    ? Screen1FromSensorReadings
    : Screen1FromEvents;

export default Screen1;