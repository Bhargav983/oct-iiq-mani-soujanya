Delegate is the one who takes care of a few machienes or units  under a respective customer 

Delegtaes gets permissions or access given by Customer 

For Ex: Customer has 5 units and customer given 
2 units to delegate and 
out of 2 - 1 unit is permission to view only and 
another is to control then only delegate can change the temperature , fan etc etc 
similar to that of customer does 

Delegate credentials: 

mobile : 0596364560
passord: 12345678

api: https://testhvacoctane.air2o.net/delegate-service-item-tasks/

GET /delegate-service-item-tasks/
HTTP 200 OK
Allow: GET, POST, HEAD, OPTIONS
Content-Type: application/json
Vary: Accept

{
    "status": "success",
    "message": "Delegates Service Items and Tasks retrieved successfully",
    "data": [
        {
            "item_id": "DIT-0002",
            "can_raise_service_request": true,
            "can_submit_customer_satisfaction_survey": true,
            "can_log_customer_complaints": true,
            "can_monitor_equipment": true,
            "can_control_equipment": true,
            "assigned_at": "2026-04-02T16:27:46.219223+03:00",
            "completed_at": null,
            "delegate": "05100-01",
            "service_item": "TEMP1769692340428"
        },
        {
            "item_id": "DIT-0003",
            "can_raise_service_request": true,
            "can_submit_customer_satisfaction_survey": true,
            "can_log_customer_complaints": true,
            "can_monitor_equipment": true,
            "can_control_equipment": true,
            "assigned_at": "2026-04-03T08:21:36.650362+03:00",
            "completed_at": null,
            "delegate": "05100-01",
            "service_item": "TEMP1770016225351"
        }
    ]
}

in the code : Path  C:\Users\bharg\Documents\Codex\octane-hvac-customer\src\DelegateProfile
 

so previously the way customer was getting detaisl from sensor readings and later we changed to events - similary here also we have to do 

Units should get detaisl from events 

the way you split screen1 to Screen1fromEvents and also components under that 
per form similar operation here 

in the dropdown of units - the way you did for customer like highlinghtng the online machiens with light green and etc 

Similariy switching the units 

Proper messages when we ex: if control permission is given then switching fan speed from high to medium etc then display messages similar to that of Customer 

Once go through : SCREEN1_EVENTS_IMPLEMENTATION_NOTES.md  to check what we have done in cusomter app 


