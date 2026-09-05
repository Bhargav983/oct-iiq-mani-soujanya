import React, { useEffect, useState, useContext, useMemo } from 'react';
import axios from 'axios';
import { AuthContext } from "../../Components/AuthContext/AuthContext";
import { useDelegateServiceItems } from "../../Components/AuthContext/DelegateServiceItemContext";
import baseURL from './../../Components/ApiUrl/Apiurl';
import { useNavigate } from 'react-router-dom';
import DelegateNavbar from "../DelegateNavbar/DelegateNavbar";
import { Card, Button, Form, Row, Col, Alert, Spinner } from 'react-bootstrap';

const RequestScreenDelegate = () => {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [closedRequestIds, setClosedRequestIds] = useState([]);
  const [submittedFeedbackRequests, setSubmittedFeedbackRequests] = useState([]);
  const [submittedComplaintRequests, setSubmittedComplaintRequests] = useState([]);
  const [complaintsData, setComplaintsData] = useState([]);
  const [feedbackData, setFeedbackData] = useState([]);
  const [serviceItemsList, setServiceItemsList] = useState([]);
  
  // Additional data for global search
  const [usersData, setUsersData] = useState([]);
  const [customersData, setCustomersData] = useState([]);
  const [companiesData, setCompaniesData] = useState([]);
  const [productsData, setProductsData] = useState([]);
  const [resourcesData, setResourcesData] = useState([]);
  const [problemTypesData, setProblemTypesData] = useState([]);

  const { user } = useContext(AuthContext);
  const company_id = user?.company_id;
  const delegate_id = user?.delegate_id;
  const navigate = useNavigate();

  // Use the enhanced context - get permissions
  const { 
    selectedServiceItem, 
    serviceItems, 
    serviceItemPermissions,
    loading: serviceItemsLoading 
  } = useDelegateServiceItems();

  // Fetch additional data for global search
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // Fetch users data
        const usersRes = await axios.get(`${baseURL}/users/`);
        if (usersRes.data && Array.isArray(usersRes.data)) {
          setUsersData(usersRes.data);
        }

        // Fetch customers data
        const customersRes = await axios.get(`${baseURL}/customers/`);
        if (customersRes.data?.status === "success") {
          setCustomersData(customersRes.data.data || []);
        }

        // Fetch companies data
        const companiesRes = await axios.get(`${baseURL}/companies/`);
        if (companiesRes.data?.status === "success") {
          setCompaniesData(companiesRes.data.data || []);
        }

        // Fetch products data
        const productsRes = await axios.get(`${baseURL}/products/`);
        if (productsRes.data?.status === "success") {
          setProductsData(productsRes.data.data || []);
        }

        // Fetch resources data
        const resourcesRes = await axios.get(`${baseURL}/resources/`);
        if (resourcesRes.data?.status === "success") {
          setResourcesData(resourcesRes.data.data || []);
        }

        // Fetch problem types data
        const problemTypesRes = await axios.get(`${baseURL}/problem-types/`);
        if (problemTypesRes.data?.status === "success") {
          setProblemTypesData(problemTypesRes.data.data || []);
        }

      } catch (error) {
        console.error("Error fetching data for global search:", error);
      }
    };

    fetchAllData();
  }, []);

  // Helper functions for global search
  // Function to get username from user ID
  const getUsernameById = (userId) => {
    if (!userId || usersData.length === 0) return userId;
    
    const user = usersData.find(user => user.user_id === userId);
    return user ? user.username : userId;
  };

  // Function to get user search data (both ID and username)
  const getUserSearchData = (userId) => {
    if (!userId) return '';
    const user = usersData.find(user => user.user_id === userId);
    return user ? `${userId} ${user.username} ${user.email || ''}` : userId;
  };

  // Function to get customer name by customer ID
  const getCustomerName = (customerId) => {
    if (!customerId || customersData.length === 0) return customerId;
    
    const customer = customersData.find(cust => cust.customer_id === customerId);
    return customer ? `${customer.full_name} (${customer.username})` : customerId;
  };

  // Function to get customer search data
  const getCustomerSearchData = (customerId) => {
    if (!customerId) return '';
    const customer = customersData.find(cust => cust.customer_id === customerId);
    return customer ? `${customerId} ${customer.username} ${customer.full_name} ${customer.email}` : customerId;
  };

  // Function to get resource name by resource ID
  const getResourceName = (resourceId) => {
    if (!resourceId || resourcesData.length === 0) return resourceId;
    
    const resource = resourcesData.find(res => res.resource_id === resourceId);
    return resource ? `${resource.first_name} ${resource.last_name}` : resourceId;
  };

  // Function to get resource search data
  const getResourceSearchData = (resourceId) => {
    if (!resourceId) return '';
    const resource = resourcesData.find(res => res.resource_id === resourceId);
    return resource ? `${resourceId} ${resource.first_name} ${resource.last_name} ${resource.email}` : resourceId;
  };

  // Function to get company name by company ID
  const getCompanyName = (companyId) => {
    if (!companyId || companiesData.length === 0) return companyId;
    
    const company = companiesData.find(comp => comp.company_id === companyId);
    return company ? company.company_name : companyId;
  };

  // Function to get product name by product ID
  const getProductName = (productId) => {
    if (!productId || productsData.length === 0) return productId;
    
    const product = productsData.find(prod => prod.product_id === productId);
    return product ? product.product_name : productId;
  };

  // Function to get problem type name by problem type ID
  const getProblemTypeName = (problemTypeId) => {
    if (!problemTypeId || problemTypesData.length === 0) return problemTypeId;
    
    const problemType = problemTypesData.find(pt => pt.problem_type_id === problemTypeId);
    return problemType ? problemType.name : problemTypeId;
  };

  // UPDATED: Get service item name from service_item ID by matching with serviceItemsList
  const getServiceItemName = (serviceItemId) => {
    if (!serviceItemId) return 'N/A';
    
    // First check in the serviceItemsList from API
    const itemFromApi = serviceItemsList.find(item => item.service_item_id === serviceItemId);
    if (itemFromApi) {
      return itemFromApi.service_item_name || serviceItemId;
    }
    
    // Fallback to context service items
    const itemFromContext = serviceItems.find(item => item.service_item === serviceItemId);
    return itemFromContext ? itemFromContext.service_item_name || serviceItemId : serviceItemId;
  };

  // Function to get service item search data
  const getServiceItemSearchData = (serviceItemId) => {
    if (!serviceItemId) return '';
    const serviceItem = serviceItemsList.find(item => item.service_item_id === serviceItemId);
    if (!serviceItem) return serviceItemId;
    
    return [
      serviceItemId,
      serviceItem.service_item_name || '',
      serviceItem.serial_number || '',
      serviceItem.pcb_serial_number || '',
      serviceItem.location || '',
      serviceItem.product_description || '',
    ].filter(Boolean).join(' ');
  };

  // Function to format date to Indian format (dd/mm/yyyy)
  const formatToIndianDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  // Function to format datetime to Indian format with time
  const formatToIndianDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  // Function to format date in multiple formats for search
  const formatDateForSearch = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const monthName = date.toLocaleString('en-IN', { month: 'long' });
    const monthShort = date.toLocaleString('en-IN', { month: 'short' });
    
    return [
      `${day}/${month}/${year}`,                    // DD/MM/YYYY
      `${month}/${day}/${year}`,                    // MM/DD/YYYY
      `${year}-${month}-${day}`,                    // YYYY-MM-DD
      `${year}${month}${day}`,                      // YYYYMMDD
      `${day}-${month}-${year}`,                    // DD-MM-YYYY
      monthName,                                    // January, February
      monthShort,                                   // Jan, Feb
      `${year}`,                                    // 2024
      `${month}/${year}`,                           // MM/YYYY
      `${day} ${monthName} ${year}`,               // 15 January 2024
      `${day} ${monthShort} ${year}`,              // 15 Jan 2024
    ].join(' ');
  };

  // NEW: Fetch service items from API to get service_item_name
  useEffect(() => {
    if (company_id && delegate_id) {
      axios.get(`${baseURL}/service-items/?user_id=${delegate_id}&company_id=${company_id}`)
        .then((response) => {
          try {
            const data = Array.isArray(response.data) ? response.data : 
                        (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
            setServiceItemsList(data);
          } catch (error) {
            console.error('Error processing service items data:', error);
            setServiceItemsList([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching service items:', error);
          setServiceItemsList([]);
        });
    }
  }, [company_id, delegate_id]);

  // Fetch service requests for the delegate - filtered by selected service item
  useEffect(() => {
    if (company_id && delegate_id && !serviceItemsLoading) {
      setLoading(true);
      axios.get(`${baseURL}/service-pools/?company_id=${company_id}&user_id=${delegate_id}`)
        .then((response) => {
          const responseData = response.data;
          let requestsArray = [];
          
          if (Array.isArray(responseData)) {
            requestsArray = responseData;
          } else if (responseData && Array.isArray(responseData.data)) {
            requestsArray = responseData.data;
          }
          
          // Filter requests by selected service item if one is selected
          let filteredRequestsArray = requestsArray;
          if (selectedServiceItem) {
            filteredRequestsArray = requestsArray.filter(
              req => req.service_item === selectedServiceItem
            );
          }
          
          const sortedRequests = filteredRequestsArray.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          );

          setRequests(sortedRequests);
          
          // Get closed request IDs
          const closedIds = sortedRequests
            .filter(req => (req.status || req.request_status || req.state || req.ServiceStatus)?.toLowerCase() === 'closed')
            .map(req => req.request_id);

          setClosedRequestIds(closedIds);
          setLoading(false);
        })
        .catch((error) => {
          console.error('Error fetching service requests:', error);
          setLoading(false);
        });
    }
  }, [company_id, delegate_id, selectedServiceItem, serviceItemsLoading]);

  // Fetch feedback/survey data for delegate
  useEffect(() => {
    if (delegate_id) {
      axios.get(`${baseURL}/customer-surveys/?user_id=${delegate_id}&company_id=${company_id}`)
        .then((response) => {
          try {
            // Handle different response structures
            const data = Array.isArray(response.data) ? response.data : 
                        (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
            
            const feedbackSubmittedRequests = data.map(
              survey => survey.service_request
            );
            setSubmittedFeedbackRequests(feedbackSubmittedRequests);
            setFeedbackData(data);
          } catch (error) {
            console.error('Error processing survey data:', error);
            setSubmittedFeedbackRequests([]);
            setFeedbackData([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching survey data:', error);
          setSubmittedFeedbackRequests([]);
          setFeedbackData([]);
        });
    }
  }, [delegate_id, company_id]);

  // Fetch complaints data for delegate
  useEffect(() => {
    if (delegate_id) {
      axios.get(`${baseURL}/customer-complaints/?user_id=${delegate_id}&company_id=${company_id}`)
        .then((response) => {
          try {
            const data = Array.isArray(response.data) ? response.data : 
                        (response.data?.data && Array.isArray(response.data.data) ? response.data.data : []);
            
            // Extract service_request IDs from complaints to track which requests have complaints submitted
            const complaintRequestIds = data.map(complaint => complaint.service_request);
            setSubmittedComplaintRequests(complaintRequestIds);
            setComplaintsData(data);
          } catch (error) {
            console.error('Error processing complaints data:', error);
            setSubmittedComplaintRequests([]);
            setComplaintsData([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching complaints data:', error);
          setSubmittedComplaintRequests([]);
          setComplaintsData([]);
        });
    }
  }, [delegate_id, company_id]);

  // Enhanced global search functionality
  const enhancedFilteredRequests = useMemo(() => {
    if (!searchTerm.trim()) {
      return requests;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    
    return requests.filter((request) => {
      // Get user data for search
      const createdBySearch = getUserSearchData(request.created_by);
      const updatedBySearch = getUserSearchData(request.updated_by);
      const requestedBySearch = getCustomerSearchData(request.requested_by);
      
      // Get other relational data for search
      const customerSearch = getCustomerSearchData(request.customer);
      const assignedEngineerSearch = getResourceSearchData(request.assigned_engineer);
      const companySearch = getCompanyName(request.company);
      const productSearch = getProductName(request.product);
      const serviceItemSearch = getServiceItemSearchData(request.service_item);
      const problemTypeSearch = getProblemTypeName(request.problem_type);
      
      // Get dates in multiple formats for search
      const preferredDateFormats = formatDateForSearch(request.preferred_date);
      const createdDateFormats = formatDateForSearch(request.created_at);
      const updatedDateFormats = formatDateForSearch(request.updated_at);
      const closedDateFormats = formatDateForSearch(request.closed_date);
      
      // Create a comprehensive search string
      const searchableText = [
        // Raw request data
        request.request_id || '',
        request.service_name || '',
        request.status || '',
        request.priority || '',
        request.description || '',
        request.request_details || '',
        request.resolution_notes || '',
        request.feedback || '',
        request.rating || '',
        request.category || '',
        request.subcategory || '',
        request.location || '',
        request.city || '',
        request.state || '',
        request.country || '',
        request.zip_code || '',
        request.phone || '',
        request.email || '',
        request.preferred_time || '',
        request.assigned_engineer || '',
        request.company || '',
        request.product || '',
        request.service_item || '',
        request.problem_type || '',
        request.preferred_date || '',
        request.created_at || '',
        request.updated_at || '',
        request.closed_date || '',
        request.dynamics_service_order_no || '',
        request.pm_group || '',
        request.estimated_completion_time || '',
        request.estimated_price || '',
        request.est_start_datetime || '',
        request.est_end_datetime || '',
        request.source_type || '',
        request.reopened_from || '',
        
        // Formatted relational data
        createdBySearch,
        updatedBySearch,
        requestedBySearch,
        customerSearch,
        assignedEngineerSearch,
        companySearch,
        productSearch,
        serviceItemSearch,
        problemTypeSearch,
        
        // Dates in multiple formats
        preferredDateFormats,
        createdDateFormats,
        updatedDateFormats,
        closedDateFormats,
        
        // Display values (exactly as shown in cards)
        formatToIndianDate(request.preferred_date),
        formatToIndianDateTime(request.created_at),
        formatToIndianDateTime(request.updated_at),
        getUsernameById(request.created_by),
        getUsernameById(request.updated_by),
        getCustomerName(request.requested_by),
        getResourceName(request.assigned_engineer),
        getCompanyName(request.company),
        getProductName(request.product),
        getServiceItemName(request.service_item),
        getProblemTypeName(request.problem_type),
        
        // Status variations for search
        request.status === 'Open' ? 'open new created' : '',
        request.status === 'Assigned' ? 'assigned allocated given' : '',
        request.status === 'UnderProgress' ? 'under progress in progress processing ongoing' : '',
        request.status === 'Reopened' ? 'reopened reopened restarted again' : '',
        request.status === 'Closed' ? 'closed completed finished done resolved' : '',
        request.status === 'Waiting for Quote' ? 'waiting for quote quotation price estimate' : '',
        request.status === 'Waiting for Spares' ? 'waiting for spares parts waiting pending spares' : '',
        request.status === 'Under Process' ? 'under process processing in progress ongoing' : '',
        request.status === 'Waiting for Client Approval' ? 'waiting for client approval customer approval pending approval' : '',
        
        // Priority variations
        request.priority === 'High' ? 'high urgent critical emergency' : '',
        request.priority === 'Medium' ? 'medium normal regular standard' : '',
        request.priority === 'Low' ? 'low minor trivial' : '',
        
        // Category variations
        request.category === 'Installation' ? 'installation install setup' : '',
        request.category === 'Repair' ? 'repair fix maintenance service' : '',
        request.category === 'Preventive Maintenance' ? 'preventive maintenance pm checkup' : '',
        request.category === 'Emergency' ? 'emergency urgent critical' : '',
        request.category === 'Complaint' ? 'complaint issue problem' : '',
        
        // Source type variations
        request.source_type === 'Customer' ? 'customer client user' : '',
        request.source_type === 'System' ? 'system automatic generated' : '',
        request.source_type === 'Re-Opened' ? 'reopened reopened from previous' : '',
        request.source_type === 'Delegate' ? 'delegate representative agent' : '',
        
        // Time variations for preferred_time
        request.preferred_time === 'Morning' ? 'morning am' : '',
        request.preferred_time === 'Afternoon' ? 'afternoon pm' : '',
        request.preferred_time === 'Evening' ? 'evening night' : '',
        request.preferred_time === 'Anytime' ? 'anytime flexible' : '',
        
        // Complaint check variations
        submittedComplaintRequests.includes(request.request_id) ? 'complaint submitted raised issue logged' : '',
        
        // Feedback check variations
        submittedFeedbackRequests.includes(request.request_id) ? 'feedback submitted given survey completed' : '',
        closedRequestIds.includes(request.request_id) ? 'closed completed finished resolved' : '',
        
        // Delegate specific search terms
        'delegate representative agent assigned authorized',
        user?.full_name || '',
        user?.username || '',
        
        // Add any other properties that might exist
        ...Object.values(request).filter(val => 
          val !== null && val !== undefined
        ).map(val => {
          if (typeof val === 'string' || typeof val === 'number') {
            return String(val);
          }
          if (typeof val === 'boolean') {
            return val ? 'true yes active' : 'false no inactive';
          }
          if (Array.isArray(val)) {
            return val.join(' ');
          }
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return '';
        })
      ]
      .join(' ')                    // Combine into one string
      .toLowerCase()                // Make case-insensitive
      .replace(/\s+/g, ' ')         // Normalize spaces
      .trim();
      
      return searchableText.includes(searchLower);
    });
  }, [
    searchTerm, 
    requests, 
    usersData, 
    customersData, 
    resourcesData, 
    companiesData, 
    productsData, 
    problemTypesData,
    serviceItemsList,
    submittedComplaintRequests,
    submittedFeedbackRequests,
    closedRequestIds,
    user
  ]);

  // Update filteredRequests when enhancedFilteredRequests changes
  useEffect(() => {
    setFilteredRequests(enhancedFilteredRequests);
    setCurrentPage(1);
  }, [enhancedFilteredRequests]);

  const handleComplaintClick = (requestId) => {
    navigate('/delegate-complaint-form', { 
      state: { 
        service_request: requestId,
        company: company_id,
        customer: delegate_id
      } 
    });
  };

  const handleViewComplaint = (requestId) => {
    const complaint = complaintsData.find(comp => comp.service_request === requestId);
    if (complaint) {
      navigate('/complaint-details', { 
        state: { 
          complaintData: complaint 
        } 
      });
    }
  };

  const handleViewFeedback = (requestId) => {
    const feedback = feedbackData.find(fb => fb.service_request === requestId);
    if (feedback) {
      navigate('/feedback-details', { 
        state: { 
          feedbackData: feedback 
        } 
      });
    }
  };

  const totalPages = Math.ceil(filteredRequests.length / rowsPerPage);
  const paginatedData = filteredRequests.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleRowsPerPageChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleRaiseRequest = () => {
    navigate('/delegate-request');
  };

  const isComplaintSubmitted = (requestId) => {
    return submittedComplaintRequests.includes(requestId);
  };

  const isFeedbackSubmitted = (requestId) => {
    return submittedFeedbackRequests.includes(requestId);
  };

  // NEW: Check permissions for Raise Request button
  const canRaiseServiceRequest = serviceItemPermissions?.can_raise_service_request;
  
  // NEW: Check permissions for Raise Complaint button
  const canLogCustomerComplaints = serviceItemPermissions?.can_log_customer_complaints;

  // NEW: Handle Edit Request
  const handleEditRequest = (request) => {
    navigate('/delegate-request', { 
      state: { 
        editMode: true,
        requestData: request 
      }
    });
  };

  // NEW: Check if request is editable (only allow editing for certain statuses)
  const isEditable = (request) => {
    const nonEditableStatuses = ['closed', 'completed', 'in progress', 'assigned'];
    return !nonEditableStatuses.includes(request.status?.toLowerCase());
  };

  if (serviceItemsLoading) {
    return (
      <div className="request-screen-wrapper">
        <DelegateNavbar/>
        <div className="text-center mt-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading service items...</span>
          </Spinner>
          <p>Loading service items...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="request-screen-wrapper">
        <DelegateNavbar/>
        <div className="text-center mt-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading requests...</span>
          </Spinner>
          <p>Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="request-screen-wrapper">
      <DelegateNavbar/>
      <h2 className="text-center mb-4 mt-5">Request Screen</h2>

      {/* Show selected service item info */}
      {selectedServiceItem && (
        <Alert variant="info" className="mb-3">
          Showing requests for Service Item: <strong>{getServiceItemName(selectedServiceItem)}</strong>
          <br />
          Permissions: 
          {canRaiseServiceRequest && <span className="badge bg-success ms-2">Can Raise Requests</span>}
          {canLogCustomerComplaints && <span className="badge bg-success ms-2">Can Log Complaints</span>}
        </Alert>
      )}

      {/* Search Results Info */}
      {searchTerm && (
        <div className="alert alert-info mb-3 py-2">
          <strong>Search Results:</strong> Found {filteredRequests.length} request(s) matching "{searchTerm}"
        </div>
      )}

      <Card className="toolbar-card shadow-sm p-3 mb-4">
        <Row className="align-items-center g-3">
          <Col xs="auto">
            <Form.Label className="mb-0 fw-semibold">Show:</Form.Label>
          </Col>
          <Col xs="auto">
            <Form.Select
              value={rowsPerPage}
              onChange={handleRowsPerPageChange}
              className="rows-select"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </Form.Select>
          </Col>

          {/* Conditionally show Raise Request button based on permissions */}
          {canRaiseServiceRequest && (
            <Col xs="auto">
              <Button variant="primary" onClick={handleRaiseRequest}>
                Raise Request
              </Button>
            </Col>
          )}

          <Col className="ms-auto">
            <div className="d-flex gap-2">
              <Form.Control
                type="text"
                placeholder="Search in all columns..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
              {searchTerm && (
                <Button 
                  variant="outline-secondary"
                  onClick={() => setSearchTerm('')}
                  size="sm"
                >
                  Clear
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {!selectedServiceItem ? (
        <Alert variant="warning" className="text-center">
          Please select a Service Item from the dropdown in the navbar to view requests.
        </Alert>
      ) : (
        <>
          <Row className="g-4">
            {paginatedData.length === 0 ? (
              <p className="text-center">
                {searchTerm 
                  ? `No requests found matching "${searchTerm}" for the selected service item.`
                  : 'No requests found for the selected service item.'}
              </p>
            ) : (
              paginatedData.map((req, index) => (
                <Col xs={12} sm={6} md={4} key={index}>
                  <Card className="request-card h-100 shadow-sm">
                    <Card.Body>
                      <Card.Title className="mb-3 text-primary fw-bold">
                        Request ID: {req.request_id}
                      </Card.Title>
                      <Card.Text>
                        <strong>Status:</strong> <span className={`status-badge ${req.status?.toLowerCase()}`}>{req.status || 'N/A'}</span><br />
                        <strong>Service Item:</strong> {getServiceItemName(req.service_item)}<br />
                        <strong>Preferred Service Date:</strong> {formatToIndianDate(req.preferred_date)}<br />
                        <strong>Preferred Service Time:</strong> {req.preferred_time}<br />
                        <strong>Requested At:</strong> {formatToIndianDateTime(req.created_at)}<br />
                        <strong>Details:</strong> {req.request_details || 'N/A'}
                        <br />
                        {req.problem_type && (
                          <>
                            <strong>Problem Type:</strong> {getProblemTypeName(req.problem_type)}<br />
                          </>
                        )}
                        {req.assigned_engineer && (
                          <>
                            <strong>Assigned Engineer:</strong> {getResourceName(req.assigned_engineer)}<br />
                          </>
                        )}
                        {req.priority && (
                          <>
                            <strong>Priority:</strong> {req.priority}<br />
                          </>
                        )}
                      </Card.Text>
                    </Card.Body>
                    <Card.Footer className="bg-white border-top-0 d-flex flex-column gap-2">
                      {/* NEW: Edit Request Button - Only show for editable requests */}
                      {isEditable(req) && (
                        <Button
                          variant="warning"
                          size="sm"
                          className="w-100"
                          onClick={() => handleEditRequest(req)}
                        >
                          Edit Request
                        </Button>
                      )}
                      
                      <div className="d-flex gap-2">
                        {/* Conditionally show Raise Complaint button based on permissions */}
                        {canLogCustomerComplaints && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-fill"
                            onClick={() => handleComplaintClick(req.request_id)}
                            disabled={isComplaintSubmitted(req.request_id)}
                          >
                            {isComplaintSubmitted(req.request_id) ? 'Complaint Submitted' : 'Raise Complaint'}
                          </Button>
                        )}
                        
                        {isComplaintSubmitted(req.request_id) && (
                          <Button
                            variant="info"
                            size="sm"
                            className="flex-fill"
                            onClick={() => handleViewComplaint(req.request_id)}
                          >
                            View Complaint
                          </Button>
                        )}
                      </div>
                      
                      {closedRequestIds.includes(req.request_id) && (
                        <div className="d-flex gap-2">
                          <Button
                            variant={isFeedbackSubmitted(req.request_id) ? "success" : "primary"}
                            size="sm"
                            className="flex-fill"
                            onClick={() => !isFeedbackSubmitted(req.request_id) && navigate(`/delegate-feedback/${req.request_id}`, {
                              state: {
                                delegateId: delegate_id
                              }
                            })}
                            disabled={isFeedbackSubmitted(req.request_id)}
                          >
                            {isFeedbackSubmitted(req.request_id) ? 'Feedback Submitted' : 'Give Feedback'}
                          </Button>
                          
                          {isFeedbackSubmitted(req.request_id) && (
                            <Button
                              variant="info"
                              size="sm"
                              className="flex-fill"
                              onClick={() => handleViewFeedback(req.request_id)}
                            >
                              View Feedback
                            </Button>
                          )}
                        </div>
                      )}
                    </Card.Footer>
                  </Card>
                </Col>
              ))
            )}
          </Row>

          <div className="d-flex justify-content-center align-items-center mt-4 gap-3 flex-wrap">
            <Button
              variant="primary"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Previous
            </Button>
            <span className="fw-semibold">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="primary"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default RequestScreenDelegate;