class LatestAllDevicesDataView(APIView):

    def get(self, request):
        company_id = request.GET.get('company_id')
        user_id = request.GET.get('user_id')
        search_query = normalize_search_query(request.GET.get('search_query') or request.GET.get('search') or '')
        
        # Get pagination parameters
        try:
            page = int(request.GET.get('page', 1))
            page_size = int(request.GET.get('page_size', 10))
        except ValueError:
            page = 1
            page_size = 10
            
        offset = (page - 1) * page_size
        cache_key = build_latest_data_cache_key(user_id, company_id, page, page_size, search_query)
        cache_key = versioned_cache_key(cache_key,"latest-device-data")
        cached_data = cache_manager.get(cache_key)
        
        if cached_data:
            try:
                response_data = json.loads(cached_data)
                response_data["debug"] = {
                    "cache_hit": True,
                    "data_source": "cache"
                }
                return Response(response_data, status=status.HTTP_200_OK)
            except Exception:
                pass

        result = []
        total_count = None
        data_source = "database"
        has_next = False

        try:
            # USER / CUSTOMER / DELEGATE CHECK
            if User.objects.filter(user_id=user_id).exists():
                user = User.objects.get(user_id=user_id)
                customer = None
                customer_delegate = None
            elif Customer.objects.filter(customer_id=user_id).exists():
                customer = Customer.objects.get(customer_id=user_id)
                user = None
                customer_delegate = None
            elif CustomerDelegate.objects.filter(delegate_id=user_id).exists():
                customer_delegate = CustomerDelegate.objects.get(delegate_id=user_id)
                user = None
                customer = None
            else:
                user = None
                customer = None
                customer_delegate = None

            # ACCESS CONTROL - Build base queryset
            if user:
                if company_id:
                    base_items = filter_by_accessible_companies(user, ServiceItems.objects.all(), selected_company_id=company_id)
                else:
                    base_items = filter_by_accessible_companies(user, ServiceItems.objects.all())
            elif customer:
                base_items = ServiceItems.objects.filter(customer=customer)
                if company_id:
                    base_items = base_items.filter(company__company_id=company_id)
            elif customer_delegate:
                base_items = ServiceItems.objects.filter(
                    delegateserviceitemtask__delegate=customer_delegate,
                    delegateserviceitemtask__can_monitor_equipment=True
                )
                if company_id:
                    base_items = base_items.filter(company__company_id=company_id)
            else:
                base_items = ServiceItems.objects.all()
                if company_id:
                    base_items = base_items.filter(company__company_id=company_id)

            if user and not base_items.exists():
                return Response({
                    "status": "error",
                    "message": "You do not have permission to view service items"
                }, status=status.HTTP_403_FORBIDDEN)

            # SEARCH AND PAGINATION LOGIC
            if search_query:
                # Try Meilisearch first
                service_item_ids_list = list(base_items.values_list('service_item_id', flat=True))
                meili_filter = f"service_item_id IN ({','.join(map(str, service_item_ids_list))})" if service_item_ids_list else None
                
                hits, total_count = perform_meilisearch_service_items(
                    search_query,
                    filters=meili_filter,
                    offset=offset,
                    limit=page_size
                )
                
                if hits is not None:
                    # Meilisearch successful
                    data_source = "meilisearch"
                    has_next = (offset + len(hits)) < total_count
                    
                    # Fetch service items in DB
                    hit_service_item_ids = [hit['service_item_id'] for hit in hits]
                    paginated_service_items = list(ServiceItems.objects.filter(service_item_id__in=hit_service_item_ids).select_related('company', 'customer'))
                else:
                    # Fallback to DB search
                    data_source = "database_fallback"
                    items_queryset = base_items.filter(
                        Q(pcb_serial_number__icontains=search_query) |
                        Q(serial_number__icontains=search_query) |
                        Q(service_item_name__icontains=search_query)
                    ).order_by('-created_at')

                    # total_count = get_cached_latest_data(company_id, user_id, search_query)
                    # if total_count is None:
                    #     try:
                    #         total_count = items_queryset.count()
                    #         set_cached_latest_data(company_id, user_id, total_count, search_query)
                    #     except Exception:
                    #         total_count = None
                    total_count = items_queryset.count()

                    # Get paginated items
                    paginated_service_items = list(items_queryset[offset:offset + page_size + 1])
                    has_next = len(paginated_service_items) > page_size
                    if has_next:
                        paginated_service_items = paginated_service_items[:-1]
            else:
                # Regular paginated DB fetch
                items_queryset = base_items.order_by('-created_at')
                
                # total_count = get_cached_latest_data(company_id, user_id, search_query)
                # if total_count is None:
                #     try:
                #         total_count = items_queryset.count()
                #         set_cached_latest_data(company_id, user_id, total_count)
                #     except Exception:
                #         total_count = None
                total_count = items_queryset.count()

                # Get paginated items
                paginated_service_items = list(items_queryset[offset:offset + page_size + 1])
                has_next = len(paginated_service_items) > page_size
                if has_next:
                    paginated_service_items = paginated_service_items[:-1]

            # -------------------------
            # OPTIMIZED SENSOR READINGS
            # -------------------------
            latest_map = {}
            if paginated_service_items:
                # Get all sensors once
                all_sensors = list(SensorParameter.objects.all())
                sensor_map = {s.code: s for s in all_sensors}
                sensor_id_to_code = {s.id: s.code for s in all_sensors}
                
                # Get target sensor IDs
                target_sensor_ids = []
                for code in PARAMETER_MAPPING.keys():
                    if code in sensor_map:
                        target_sensor_ids.append(sensor_map[code].id)
                
                # Get service item IDs
                service_item_ids = [item.service_item_id for item in paginated_service_items]
                
                if target_sensor_ids and service_item_ids:
                    from django.db.models import Max
                    from django.db.models import Q
                    
                    # Step 1: Get the maximum timestamp for each (service_item, sensor) pair
                    max_timestamps = SensorReading.objects.filter(
                        service_item__service_item_id__in=service_item_ids,
                        sensor__id__in=target_sensor_ids
                    ).values(
                        'service_item__service_item_id',
                        'sensor__id'
                    ).annotate(
                        max_timestamp=Max('original_timestamp')
                    ).values(
                        'service_item__service_item_id',
                        'sensor__id',
                        'max_timestamp'
                    )
                    
                    # Build a Q object to query all max timestamp combinations at once
                    q_filters = Q()
                    for item in max_timestamps:
                        q_filters |= (
                            Q(service_item__service_item_id=item['service_item__service_item_id']) & 
                            Q(sensor__id=item['sensor__id']) & 
                            Q(original_timestamp=item['max_timestamp'])
                        )
                    
                    # Step 2: Get all matching readings in one query
                    latest_readings_qs = SensorReading.objects.filter(q_filters).values_list(
                        'service_item__service_item_id',
                        'sensor__id',
                        'value'
                    )
                    
                    # Build latest map
                    for service_item_id_val, sensor_id_val, value_val in latest_readings_qs:
                        if sensor_id_val in sensor_id_to_code:
                            code = sensor_id_to_code[sensor_id_val]
                            latest_map[(service_item_id_val, code)] = value_val


            # -------------------------
            # BUILD RESPONSE
            # -------------------------
            for service_item in paginated_service_items:
                service_item_data = {
                    "service_item_id": service_item.service_item_id,
                    "pcb_serial_number": service_item.pcb_serial_number,
                    "serial_number": service_item.serial_number,
                    "service_item_name": service_item.service_item_name
                }

                for code, key in PARAMETER_MAPPING.items():
                    value = latest_map.get((service_item.service_item_id, code))
                    sensor = sensor_map.get(code) if 'sensor_map' in locals() else None
                    service_item_data[key] = {
                        "value": value,
                        "unit": sensor.unit_of_measurement if sensor else ""
                    }

                result.append(service_item_data)

            total_pages = (total_count + page_size - 1) // page_size if total_count is not None else None
            has_previous = page > 1

            response_data = {
                "status": "success",
                "message": "Latest data fetched successfully.",
                "data": result,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_count": total_count,
                    "total_pages": total_pages,
                    "has_next": has_next,
                    "has_previous": has_previous,
                    "next_page": page + 1 if has_next else None,
                    "previous_page": page - 1 if has_previous else None,
                },
                "debug": {
                    "cache_hit": False,
                    "data_source": data_source
                }
            }
            
            # Cache the response
            try:
                cache_manager.set(cache_key, json.dumps(response_data, default=str), timeout=300)
            except Exception:
                pass
                
            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({
                "status": "error",
                "message": "Failed to retrieve data",
                "error": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

and

# IoT Data
PARAMETER_MAPPING = {
    "ODT": "outdoor_temperature",      # Outdoor Temperature
    "RH": "room_humidity",             # Room Humidity
    "RT": "room_temperature",          # Room Temperature
    "HPS": "hvac_on",                  # HVAC Power Status
    "MD": "mode",                      # Mode
    "FS": "fan_speed",                 # Fan Speed
    "SRT": "set_temperature",          # Set Mode Temperature
    "EOF": "error_flag",               # Error Occurred Flag
    "LEU": "alarm_occurred",           # Live Error Update (Alarm)
    "HORB": "hvac_busy",               # HVAC Operation Ready/Busy
}

The below are my Previuos get-latest-data api.

https://testhvacoctane.air2o.net/get-latest-data/?user_id=testing-1234&company_id=SA-GA-01

HTTP 200 OK
Allow: GET, HEAD, OPTIONS
Content-Type: application/json
Vary: Accept

{
    "status": "success",
    "message": "Latest data fetched for all service items.",
    "count": 3,
    "data": [
        {
            "pcb_serial_number": "2507GM0263",
            "is_online": false,
            "outdoor_temperature": {
                "value": "28.0",
                "unit": "°C"
            },
            "room_humidity": {
                "value": "62",
                "unit": "RH%"
            },
            "room_temperature": {
                "value": "32.3",
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
                "value": "1",
                "unit": ""
            },
            "set_temperature": {
                "value": "27",
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
        {
            "pcb_serial_number": "2507GM0456",
            "is_online": false,
            "outdoor_temperature": {
                "value": "31.0",
                "unit": "°C"
            },
            "room_humidity": {
                "value": "43",
                "unit": "RH%"
            },
            "room_temperature": {
                "value": "36.9",
                "unit": "°C"
            },
            "hvac_on": {
                "value": "0",
                "unit": ""
            },
            "mode": {
                "value": "1",
                "unit": ""
            },
            "fan_speed": {
                "value": "3",
                "unit": ""
            },
            "set_temperature": {
                "value": "24",
                "unit": "°C"
            },
            "error_flag": {
                "value": "0",
                "unit": ""
            },
            "alarm_occurred": {
                "value": "4",
                "unit": ""
            },
            "hvac_busy": {
                "value": "0",
                "unit": ""
            }
        },
        {
            "pcb_serial_number": "2507GM0313",
            "is_online": false,
            "outdoor_temperature": {
                "value": "27.0",
                "unit": "°C"
            },
            "room_humidity": {
                "value": "45",
                "unit": "RH%"
            },
            "room_temperature": {
                "value": "39.9",
                "unit": "°C"
            },
            "hvac_on": {
                "value": "0",
                "unit": ""
            },
            "mode": {
                "value": "0",
                "unit": ""
            },
            "fan_speed": {
                "value": "3",
                "unit": ""
            },
            "set_temperature": {
                "value": "21",
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
        }
    ]
}