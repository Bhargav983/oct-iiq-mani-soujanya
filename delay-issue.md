Previously, we had used the - https://testhvacoctane.air2o.net/get-latest-data/?user_id=05100&company_id=SA-GA-01(Get all machine latest data)

{
    "status": "success",
    "message": "Latest data fetched for all service items.",
    "count": 8,
    "data": [
        {
            "pcb_serial_number": "1234567890",
            "is_online": false,
            "outdoor_temperature": {
                "value": null,
                "unit": "°C"
            },
            "room_humidity": {
                "value": null,
                "unit": "RH%"
            },
            "room_temperature": {
                "value": null,
                "unit": "°C"
            },
            "hvac_on": {
                "value": null,
                "unit": null
            },
            "mode": {
                "value": null,
                "unit": null
            },
            "fan_speed": {
                "value": null,
                "unit": null
            },
            "set_temperature": {
                "value": null,
                "unit": "°C"
            },
            "error_flag": {
                "value": null,
                "unit": null
            },
            "alarm_occurred": {
                "value": null,
                "unit": null
            },
            "hvac_busy": {
                "value": null,
                "unit": null
            }
        },
        {
            "pcb_serial_number": "2411GM-0102",
            "is_online": false,
            "outdoor_temperature": {
                "value": "31.0",
                "unit": "°C"
            },
            "room_humidity": {
                "value": "62",
                "unit": "RH%"
            },
            "room_temperature": {
                "value": "32.9",
                "unit": "°C"
            },
            "hvac_on": {
                "value": "1",
                "unit": ""
            },
            "mode": {
                "value": "3",
                "unit": ""
            },
            "fan_speed": {
                "value": "0",
                "unit": ""
            },
            "set_temperature": {
                "value": "25",
                "unit": "°C"
            },
            "error_flag": {
                "value": "0",
                "unit": ""
            },
            "alarm_occurred": {
                "value": "2",
                "unit": ""
            },
            "hvac_busy": {
                "value": "0",
                "unit": ""
            }
        },..
}
}
API and https://testhvacoctane.air2o.net/get-latest-data/2507GM0284/?user_id=05100&company_id=SA-GA-01 (Get by pcb_serisl_number) API
{
    "status": "success",
    "message": "Latest data fetched for service item 2507GM0284.",
    "data": {
        "pcb_serial_number": "2507GM0284",
        "is_online": false,
        "outdoor_temperature": {
            "value": "34.0",
            "unit": "°C"
        },
        "room_humidity": {
            "value": "69",
            "unit": "RH%"
        },
        "room_temperature": {
            "value": "31.3",
            "unit": "°C"
        },
        "hvac_on": {
            "value": "1",
            "unit": ""
        },
        "mode": {
            "value": "4",
            "unit": ""
        },
        "fan_speed": {
            "value": "0",
            "unit": ""
        },
        "set_temperature": {
            "value": "18",
            "unit": "°C"
        },
        "error_flag": {
            "value": "0",
            "unit": ""
        },
        "alarm_occurred": {
            "value": "0",
            "unit": ""
        },
        "hvac_busy": {
            "value": "0",
            "unit": ""
        }
    },
    "debug": {
        "cache_hit": false,
        "data_source": "database"
    }
}.
Actually the machiene data is POSTed to cloud to https://mdata.air2o.net/events api

[
    {
        "id": 123305,
        "created_at": "20-09-2026 16:00:49",
        "payload": "0xA1,DI:2507GM0448,ODT:400,INDT:320,AST:260,ODH:43,INDH:93,INPC:30,DPC:5,RT:398,RH:36,TDS:0,WPL:13618,0xZA"
    },
    {
        "id": 123304,
        "created_at": "20-09-2026 15:55:00",
        "payload": "0xA1,DI:2507GM0448,ODT:400,INDT:320,AST:260,ODH:45,INDH:93,INPC:30,DPC:5,RT:387,RH:39,TDS:0,WPL:13367,0xZA"
    },
    {
..

From the mdata url, Backedn process the process and updated in the get-latest-data api.(So it will taking some time).Belwo is my backend tasks.py code where the 

from datetime import datetime
import requests
from django.db import transaction
from .models import *
from App1.notifications import send_fcm_notification
from django.db.models import Q

def fetch_iot_data_job():
    print("[Scheduler] Fetching IoT data...")

    try:
        # Fetch events from the external server
        response = requests.get("https://mdata.air2o.net/events/")
        if response.status_code != 200:
            print(f"[Scheduler] Failed to fetch data. Status: {response.status_code}")
            return

        events = response.json()
        if not events:
            print("[Scheduler] No events found.")
            return

        print(f"[Scheduler] Received {len(events)} events.")

        # Sort events by event_id to maintain chronological order
        events.sort(key=lambda x: x.get("id", 0))

        event_ids = [int(event.get("id")) for event in events if event.get("id")]
        existing_ids = set(SensorReading.objects.filter(event_id__in=event_ids).values_list('event_id', flat=True))
        existing_error_ids = set(ErrorCodeReading.objects.filter(event_id__in=event_ids).values_list('event_id', flat=True))

        # ✅ OPTIMIZATION 1: Pre-fetch all ServiceItems into a dict — eliminates per-event DB query
        service_item_map = {
            item.pcb_serial_number: item
            for item in ServiceItems.objects.all()
        }

        # ✅ OPTIMIZATION 2: Pre-fetch all SensorParameters into dicts — eliminates per-event & per-sensor DB queries
        all_sensors = SensorParameter.objects.all()
        sensor_map = {sensor.code: sensor for sensor in all_sensors}  # code -> SensorParameter object
        valid_codes_map = {}  # batch_type -> set of valid codes
        for sensor in all_sensors:
            valid_codes_map.setdefault(sensor.batch_type, set()).add(sensor.code)

        # ✅ OPTIMIZATION 3: Pre-fetch all ErrorCodes into a dict — eliminates per-event DB query
        error_code_map = {ec.code: ec for ec in ErrorCode.objects.all()}

        inserted_count = 0
        skipped_count = 0
        batch_inserted = {"Batch 1": 0, "Batch 2": 0, "Batch 3": 0}
        batch_skipped = {"Batch 1": 0, "Batch 2": 0, "Batch 3": 0}
        skipped_events = []
        first_processed_id = None
        last_processed_id = None

        SCALING_RULES = {
            "ODT": 10, "INDT": 10, "AST": 10, "RT": 10,
            "INPC": 10, "DPC": 10, "P1C": 10, "P2C": 10, "P3C": 10,
            "P1KW": 100, "P2KW": 100, "P3KW": 100, "TP": 100
        }

        DS_FLAGS = {
            "EOF": 0, "HORB": 1, "HPHF": 2, "CDF": 3, "HPC": 4, "HPS": 5, "ISOC": 6
        }

        sensor_readings_to_create = []
        error_readings_to_create = []

        # Process all events in chronological order (sorted by event_id)
        for idx, event in enumerate(events):
            event_id = int(event.get("id")) if event.get("id") else None
            created_at = event.get("created_at", "").strip()  # This is the database insertion timestamp
            raw_data = event.get("payload", "").strip()

            if idx == 0:
                first_processed_id = event_id
            last_processed_id = event_id

            if not event_id or not raw_data:
                skipped_events.append({"event_id": event_id, "reason": "Missing event_id or payload"})
                skipped_count += 1
                continue

            if event_id in existing_ids:
                skipped_events.append({"event_id": event_id, "reason": "Already exists"})
                skipped_count += 1
                continue

            try:
                original_timestamp = datetime.strptime(created_at, "%d-%m-%Y %H:%M:%S")
            except ValueError:
                original_timestamp = datetime.utcnow()  # Fallback to current UTC time if parsing fails

            # Store raw data for each event in SensorReading model
            service_item = None
            device_id = None
            data_points = []
            batch_type = None

            # Process the raw data payload and store batch type and device information
            parts = raw_data.split(',')
            for part in parts:
                if part.startswith("DI:"):
                    device_id = part.split(':')[1]
                elif part.startswith("0xA1"):
                    batch_type = 'Batch 1'
                elif part.startswith("0xA2"):
                    batch_type = 'Batch 2'
                elif part.startswith("0xA3"):
                    batch_type = 'Batch 3'
                elif ":" in part and not part.startswith("0x"):
                    key, val = part.split(':', 1)
                    data_points.append((key.strip(), val.strip()))

            if not device_id or not batch_type:
                skipped_events.append({"event_id": event_id, "reason": "Missing device_id or batch_type"})
                skipped_count += 1
                continue

            # ✅ OPTIMIZATION 1 APPLIED: Dict lookup instead of DB query
            service_item = service_item_map.get(device_id)

            if not service_item:
                skipped_events.append({"event_id": event_id, "reason": f"No ServiceItem found with pcb_serial_number {device_id}"})
                skipped_count += 1
                continue

            # ✅ OPTIMIZATION 2 APPLIED: Dict lookup instead of DB query
            valid_codes = valid_codes_map.get(batch_type, set())
            if not valid_codes:
                skipped_events.append({"event_id": event_id, "reason": f"No valid sensors for {batch_type}"})
                batch_skipped[batch_type] += 1
                skipped_count += 1
                continue

            inserted_for_event = False

            # Process the data points and insert sensor readings
            for code, value in data_points:
                if code not in valid_codes and not (batch_type == 'Batch 3' and code == 'DS'):
                    continue

                if batch_type == 'Batch 3' and code == 'DS':
                    try:
                        device_status = int(value)

                        # Store all DS flags (EOF, HORB, etc.)
                        for db_code, bit_pos in DS_FLAGS.items():
                            flag_value = (device_status >> bit_pos) & 1
                            # ✅ OPTIMIZATION 2 APPLIED: Dict lookup instead of DB query
                            sensor = sensor_map.get(db_code)
                            if sensor:
                                sensor_readings_to_create.append(SensorReading(
                                    service_item=service_item,
                                    sensor=sensor,
                                    value=str(flag_value),
                                    raw_data=None,
                                    event_id=event_id,
                                    original_timestamp=original_timestamp
                                ))
                                inserted_for_event = True

                        # Process error codes (EC)
                        ec_value = next((val for k, val in data_points if k == "EC"), None)

                        if ec_value is not None:
                            try:
                                ec_code_int = int(ec_value)

                                if ec_code_int != 0:  # Only store actual error codes
                                    print(f"Processing Error Code: {ec_code_int} for event {event_id}")

                                    if event_id not in existing_error_ids:
                                        # ✅ OPTIMIZATION 3 APPLIED: Dict lookup instead of DB query
                                        ec_obj = error_code_map.get(ec_code_int)
                                        if ec_obj:
                                            error_readings_to_create.append(ErrorCodeReading(
                                                service_item=service_item,
                                                error_code=ec_obj,
                                                description=ec_obj.description,
                                                priority=ec_obj.priority,
                                                event_id=event_id,
                                                original_timestamp=original_timestamp,
                                            ))
                                            print(f"Stored error EC-{ec_code_int} for device {device_id}")
                                        else:
                                            print(f"Error code {ec_code_int} not found in ErrorCode table")

                                else:
                                    print(f"EC=0 → no actionable error for device {device_id}")

                            except ValueError:
                                print(f"Invalid EC value format: {ec_value}")

                    except ValueError:
                        continue

                    continue

                # For other sensors, process their readings
                # ✅ OPTIMIZATION 2 APPLIED: Dict lookup instead of DB query
                sensor = sensor_map.get(code)
                if not sensor:
                    continue

                try:
                    if SCALING_RULES.get(code):
                        numeric_value = float(value) / SCALING_RULES[code]
                        final_value = str(numeric_value)
                    else:
                        if value.isdigit():
                            final_value = value
                        else:
                            float_val = float(value)
                            final_value = str(int(float_val)) if float_val.is_integer() else str(float_val)
                except ValueError:
                    continue

                sensor_readings_to_create.append(SensorReading(
                    service_item=service_item,
                    sensor=sensor,
                    value=final_value,
                    raw_data=raw_data if batch_type == 'Batch 1' else None,
                    event_id=event_id,
                    original_timestamp=original_timestamp
                ))
                inserted_for_event = True

            if inserted_for_event:
                inserted_count += 1
                batch_inserted[batch_type] += 1
            else:
                skipped_count += 1
                batch_skipped[batch_type] += 1
                skipped_events.append({"event_id": event_id, "reason": "No valid readings"})

        # Bulk insert sensor readings and error code readings
        with transaction.atomic():
            if sensor_readings_to_create:
                SensorReading.objects.bulk_create(sensor_readings_to_create, batch_size=500)
            if error_readings_to_create:
                ErrorCodeReading.objects.bulk_create(error_readings_to_create, batch_size=500)

                # Trigger notifications for Critical / High errors
                high_critical_errors = [e for e in error_readings_to_create if e.priority in ['HIGH', 'CRITICAL']]

                for err in high_critical_errors:
                    service_item = err.service_item
                    customer = service_item.customer
                    company = service_item.company

                    # Get all Service Managers
                    service_managers = User.objects.filter(
                        Q(role='Service Manager') &
                        (Q(companies=company) | Q(default_company=company))
                    )

                    # Notify Service Managers
                    for manager in service_managers:
                        if getattr(manager, "fcm_token", None):
                            send_fcm_notification(
                                fcm_token=manager.fcm_token,
                                title=f"{err.priority} Alert - {service_item.serial_number}",
                                body=f"{err.description} detected. Immediate attention required.",
                                target="ServiceManager-ErrorDashboard"
                            )

                    # Notify Customer
                    if getattr(customer, "fcm_token", None):
                        send_fcm_notification(
                            fcm_token=customer.fcm_token,
                            title=f"{err.priority} Error - {service_item.serial_number}",
                            body=f"{err.description}. Detected on {err.original_timestamp.strftime('%d %b %Y %H:%M')}.",
                            target="Customer-ErrorDashboard"
                        )

                    # Notify active Delegates with monitor permission for this service item
                    eligible_tasks = (
                        DelegateServiceItemTask.objects
                        .filter(
                            service_item=service_item,
                            delegate__customer=customer,
                            delegate__status='Active',
                            can_monitor_equipment=True
                        )
                        .select_related('delegate')
                    )
                    for task in eligible_tasks:
                        delegate = task.delegate
                        if getattr(delegate, "fcm_token", None):
                            send_fcm_notification(
                                fcm_token=delegate.fcm_token,
                                title=f"{err.priority} Error - {service_item.serial_number}",
                                body=f"{err.description}. Check system status immediately.",
                                target="Delegate-ErrorDashboard"
                            )

        # Print Detailed Summary
        print("\n===== Data Processing Summary =====")
        print(f"Inserted Records: {inserted_count}")
        print(f"Skipped Records: {skipped_count}")
        print(f"First Processed Event ID: {first_processed_id or 'None'}")
        print(f"Last Processed Event ID: {last_processed_id or 'None'}")
        print("\nBatch-wise Inserted:", batch_inserted)
        print("Batch-wise Skipped:", batch_skipped)
        print("Error Readings Inserted:", len(error_readings_to_create))
        print("===================================")
        print("Last record read for reference:")
        print(last_processed_id if last_processed_id else "No record processed")
        print("\nSkipped Details (first 5):", skipped_events[:1])

    except Exception as e:
        print(f"[Scheduler] Error occurred: {str(e)}")

To solve time taking issue or delay issue,  we are used the direct - https://mdata.air2o.net/events API, in the frontend react project (Now speed is better).

But in some cases, still we are facinhg an issues like switching from one machine to another machine, ON/OFF issue, alarm count display issue, alarm code displaying wrongly etc..

To avoid this delay , I want to use same logic which we had used to extract the events api data parameters into get-latest-api data parameter.
For that logic i am providing a logic and backend file with explanation, you can go read the complete document and use same thing to extract the file /machinescreen1 path (  <Route path="/machinescreen1" element={<Screen1 />} />).
In this code or file , i want to use the logic to extract the values from the events api.

Dont change any other existing code or functionalities.

Plese come up with a plan , later we will proceed on implementation. 
