import React, { useEffect, useState, useContext } from 'react';
import NavScreen from '../../../Components/Screens/Navbar/Navbar';
import './ServiceRequestForm.css';
import { AuthContext } from '../../AuthContext/AuthContext';
import baseURL from '../../ApiUrl/Apiurl';
import Notification_Url from '../../ApiUrl/PushNotificanURL';
import { useNavigate, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FaTimes, FaUpload, FaImage, FaVideo, FaEye, FaTrash } from 'react-icons/fa';
import Select from "react-select";

const ServiceRequestForm = () => { 
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const userId = user?.customer_id;
  const company_id = user?.company_id;
  
  // Check if we're in edit mode
  const isEditMode = location.state?.editMode || false;
  const existingRequest = location.state?.requestData || null;
  
  console.log("User ID from context:", userId);
  console.log("Company ID from context:", company_id);
  console.log("Edit mode:", isEditMode);
  console.log("Existing request:", existingRequest);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [existingMedia, setExistingMedia] = useState([]);
  const [deletingMedia, setDeletingMedia] = useState([]);
  const [problemTypes, setProblemTypes] = useState([]);
  const [form, setForm] = useState({
    request_details: '',
    preferred_date: '',
    preferred_time: '',
    status: 'Unassigned',
    source_type: 'Customer Request',
    service_item: '',
    customer: userId,
    problem_type: '',
  });

  const [serviceItems, setServiceItems] = useState([]);

  // Fetch problem types
  useEffect(() => {
    const fetchProblemTypes = async () => {
      try {
        const response = await fetch(`${baseURL}/problem-types/`);
        if (response.ok) {
          const result = await response.json();
          if (result.status === "success" && Array.isArray(result.data)) {
            setProblemTypes(result.data);
          }
        } else {
          console.error('Failed to fetch problem types');
        }
      } catch (error) {
        console.error('Error fetching problem types:', error);
      }
    };

    fetchProblemTypes();
  }, []);

  // Fetch existing media when in edit mode
  useEffect(() => {
    if (isEditMode && existingRequest?.request_id) {
      fetchExistingMedia(existingRequest.request_id);
    }
  }, [isEditMode, existingRequest]);

  // Initialize form with existing data if in edit mode
  useEffect(() => {
    if (isEditMode && existingRequest) {
      setForm({
        request_details: existingRequest.request_details || '',
        preferred_date: existingRequest.preferred_date || '',
        preferred_time: existingRequest.preferred_time ? existingRequest.preferred_time.slice(0, 5) : '',
        status: existingRequest.status || 'Unassigned',
        source_type: existingRequest.source_type || 'Customer Request',
        service_item: existingRequest.service_item || '',
        customer: existingRequest.customer || userId,
        problem_type: existingRequest.problem_type || '',
      });
      setSelectedCompany(existingRequest.company || null);
    }
  }, [isEditMode, existingRequest, userId]);

  useEffect(() => {
    const fetchServiceItems = async () => {
      try {
        const response = await fetch(`${baseURL}/service-items/?user_id=${userId}&company_id=${company_id}`);
        if (response.ok) {
          const result = await response.json();
          const serviceItemsArray = result.data;

          const userServiceItem = serviceItemsArray.find(
            (item) => item.customer === user?.customer_id
          );

          if (userServiceItem) {
            setSelectedCompany(userServiceItem.company);
            const filteredItems = serviceItemsArray.filter(
              (item) => item.customer === user?.customer_id
            );
            setServiceItems(filteredItems);
          }
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to load service items',
            confirmButtonColor: '#d33',
          });
        }
      } catch (error) {
        console.error('Error fetching service items:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Something went wrong while loading service items.',
          confirmButtonColor: '#d33',
        });
      }
    };

    fetchServiceItems();
  }, [userId]);

  // Fetch existing media files
  const fetchExistingMedia = async (requestId) => {
    try {
      const response = await fetch(
        `${baseURL}/service-pools/${requestId}/media/?user_id=${userId}&company_id=${company_id}`
      );
      
      if (response.ok) {
        const result = await response.json();
        if (result.status === "success") {
          setExistingMedia(result.data || []);
        }
      } else {
        console.error('Failed to fetch existing media');
      }
    } catch (error) {
      console.error('Error fetching existing media:', error);
    }
  };

  // Delete media file immediately - FIXED VERSION
 // SIMPLE delete method
const deleteMediaFile = async (mediaId) => {
  try {
    setDeletingMedia(prev => [...prev, mediaId]);

    const deleteUrl = `${baseURL}/service-pools/${existingRequest.request_id}/media/${mediaId}/`;

     const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        company_id: company_id
      })
    });

    if (response.ok || response.status === 204) {
      // Remove from UI
      setExistingMedia(prev =>
        prev.filter(media => media.media_id !== mediaId)
      );

      await Swal.fire({
        icon: "success",
        title: "Deleted",
        text: "Media file deleted successfully!",
      });

      return true;
    } else {
      throw new Error("Failed to delete media file");
    }
  } catch (error) {
    console.error("Delete Error:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: "Unable to delete the file. Please try again.",
    });
  } finally {
    setDeletingMedia(prev => prev.filter(id => id !== mediaId));
  }
};


  // Alternative delete method using request body instead of query parameters
  const deleteMediaFileWithBody = async (mediaId) => {
    try {
      setDeletingMedia(prev => [...prev, mediaId]);
      
      const deleteUrl = `${baseURL}/service-pools/${existingRequest.request_id}/media/${mediaId}/`;
      
      console.log('DELETE URL with body:', deleteUrl);
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          company_id: company_id,
          customer_id: userId
        }),
      });

      if (response.ok || response.status === 204) {
        // Remove from existing media immediately
        setExistingMedia(prev => prev.filter(media => media.media_id !== mediaId));
        
        await Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'Media file deleted successfully!',
          confirmButtonColor: '#3085d6',
        });
        
        return true;
      } else {
        let errorMessage = 'Failed to delete media file';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.detail || errorMessage;
        } catch (parseError) {
          errorMessage = response.statusText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting media file with body:', error);
      throw error;
    } finally {
      setDeletingMedia(prev => prev.filter(id => id !== mediaId));
    }
  };

 const handleDeleteMedia = async (media) => {
  const result = await Swal.fire({
    title: "Delete File?",
    text: "This action cannot be undone!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Delete",
    cancelButtonText: "Cancel"
  });

  if (result.isConfirmed) {
    await deleteMediaFile(media.media_id);
  }
};


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    
    // Validate file types and sizes
    const validFiles = files.filter(file => {
      const isValidType = file.type.startsWith('image/') || file.type.startsWith('video/');
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB limit
      
      if (!isValidType) {
        Swal.fire({
          icon: 'warning',
          title: 'Invalid File Type',
          text: `${file.name} is not a valid image or video file.`,
          confirmButtonColor: '#f8bb86',
        });
        return false;
      }
      
      if (!isValidSize) {
        Swal.fire({
          icon: 'warning',
          title: 'File Too Large',
          text: `${file.name} exceeds 50MB size limit.`,
          confirmButtonColor: '#f8bb86',
        });
        return false;
      }
      
      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
    e.target.value = ''; // Reset file input
  };

  // Remove file from selection
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // View media file
  const viewMedia = (media) => {
    // Use the full URL path from the media object
    const fullUrl = media.file.startsWith('http') 
      ? media.file 
      : `${baseURL}${media.file}`;
    window.open(fullUrl, '_blank');
  };

  // Upload media files to the service request
  const uploadMediaFiles = async (requestId, serviceItemId) => {
    if (selectedFiles.length === 0) return true;

    try {
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('company_id', company_id);
      formData.append('service_item_id', serviceItemId);

      // Append all files
      selectedFiles.forEach(file => {
        formData.append('file', file);
      });

      const mediaUrl = `${baseURL}/service-pools/${requestId}/media/`;
      
      const response = await fetch(mediaUrl, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        console.log('Media files uploaded successfully');
        return true;
      } else {
        const errorData = await response.json();
        console.error('Media upload failed:', errorData);
        throw new Error(errorData.message || 'Media upload failed');
      }
    } catch (error) {
      console.error('Error uploading media files:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const selectedItem = serviceItems.find(
      (item) => item.service_item_id === form.service_item
    );

    if (!selectedItem) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Input',
        text: 'Please select a valid service item.',
        confirmButtonColor: '#f8bb86',
      });
      setIsSubmitting(false);
      return;
    }

    const payload = {
      request_id: isEditMode ? existingRequest.request_id : Math.floor(Math.random() * 1000000).toString(),
      dynamics_service_order_no: isEditMode ? existingRequest.dynamics_service_order_no : "string",
      source_type: form.source_type,
      request_details: form.request_details || "Service required",
      alert_details: isEditMode ? existingRequest.alert_details : "string",
      requested_by: user?.customer_id || "unknown",
      preferred_date: form.preferred_date,
      preferred_time: `${form.preferred_time}:00`,
      status: isEditMode ? existingRequest.status : "Open",
      estimated_completion_time: isEditMode ? existingRequest.estimated_completion_time : null,
      estimated_price: isEditMode ? existingRequest.estimated_price : "0.00",
      est_start_datetime: `${form.preferred_date}T${form.preferred_time}:00Z`,
      est_end_datetime: `${form.preferred_date}T${form.preferred_time}:00Z`,
      act_start_datetime: isEditMode ? existingRequest.act_start_datetime : `${form.preferred_date}T${form.preferred_time}:00Z`,
      act_end_datetime: isEditMode ? existingRequest.act_end_datetime : `${form.preferred_date}T${form.preferred_time}:00Z`,
      act_material_cost: isEditMode ? existingRequest.act_material_cost : "0.00",
      act_labour_hours: isEditMode ? existingRequest.act_labour_hours : "0.00",
      act_labour_cost: isEditMode ? existingRequest.act_labour_cost : "0.00",
      completion_notes: isEditMode ? existingRequest.completion_notes : "Not yet completed",
      created_by: isEditMode ? existingRequest.created_by : "Customer",
      updated_by: "Customer",
      company: selectedCompany || "unknown",
      service_item: form.service_item,
      customer: user?.customer_id || "unknown",
      problem_type: form.problem_type || null,
      pm_group: selectedItem?.pm_group || "default-pm",
      assigned_engineer: isEditMode ? existingRequest.assigned_engineer : "",
      reopened_from: isEditMode ? existingRequest.reopened_from : "",
      company_id: selectedCompany || "unknown",
      user_id: userId,
    };

    console.log("Payload being sent:", JSON.stringify(payload, null, 2));

    try {
      const url = isEditMode 
        ? `${baseURL}/service-pools/${existingRequest.request_id}/` 
        : `${baseURL}/service-pools/`;
      
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const requestId = data.data?.request_id || existingRequest?.request_id;

        // Upload new media files for both new and edit modes
        if (selectedFiles.length > 0 && requestId) {
          try {
            await uploadMediaFiles(requestId, form.service_item);
          } catch (mediaError) {
            console.warn('Media upload failed but request was created:', mediaError);
          }
        }

        await Swal.fire({
          icon: 'success',
          title: 'Success',
          text: `Service request ${isEditMode ? 'updated' : 'submitted'} successfully!`,
          confirmButtonColor: '#3085d6',
        });
        
        navigate('/request');

        // Reset form only if not in edit mode
        if (!isEditMode) {
          setForm({
            request_details: '',
            preferred_date: '',
            preferred_time: '',
            status: 'Unassigned',
            source_type: 'Customer Request',
            service_item: '',
            customer: user?.customer_id,
            problem_type: '',
          });
          setSelectedFiles([]);
        }

        // Send notification only for new requests
        if (!isEditMode) {
          try {
            const userResponse = await fetch(`${baseURL}/users/`);
            if (userResponse.ok) {
              const users = await userResponse.json();
              const serviceManager = users.find(
                (u) => u.role === 'Service Manager' && u.fcm_token
              );

              if (serviceManager) {
                const notifyResponse = await fetch(`${Notification_Url}/send-notification`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: serviceManager.fcm_token,
                    title: 'New Service Request',
                    body: `Service request raised by ${user?.customer_id}`,
                  }),
                });

                if (!notifyResponse.ok) {
                  console.warn('Notification failed to send');
                }
              }
            }
          } catch (notificationError) {
            console.error('Notification error:', notificationError);
          }
        }
      } else {
        let errorMessage = `Failed to ${isEditMode ? 'update' : 'submit'} request.`;
        try {
          const errorData = await response.json();
          console.error("Backend returned error:", errorData);
          if (errorData.errors) {
            console.table(errorData.errors);
          }
          errorMessage = errorData.message || JSON.stringify(errorData) || errorMessage;
        } catch (parseError) {
          console.error('Error parsing backend error response:', parseError);
        }

        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: errorMessage,
          confirmButtonColor: '#d33',
        });
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'An error occurred while submitting. Please try again later.',
        confirmButtonColor: '#d33',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/request');
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get file name from path
  const getFileNameFromPath = (filePath) => {
    return filePath.split('/').pop() || 'File';
  };

  return (
    <div className="service-request-form">
      <div className="service-request-card">
        <div className="service-request-header">
          <h5 className="mb-1">{isEditMode ? 'Edit Service Request' : 'Service Request Form'}</h5>
          <h6 className="text" style={{ color: '' }}>
            {isEditMode ? 'Update the service request details' : 'Please fill in the service request details'}
          </h6>
        </div>
        <div className="service-request-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
            <div className="col-md-6">
  <label
    className="formlabel"
  >
    Service Item ID
  </label>

  <Select
    name="service_item"
    value={
      serviceItems
        .map((item) => ({
          value: item.service_item_id,
          label: `${item.service_item_name} - ${item.service_item_id}`,
        }))
        .find((option) => option.value === form.service_item)
    }
    onChange={(selectedOption) =>
      handleChange({
        target: {
          name: "service_item",
          value: selectedOption ? selectedOption.value : "",
        },
      })
    }
    options={serviceItems.map((item) => ({
      value: item.service_item_id,
      label: `${item.service_item_name} - ${item.service_item_id}`,
    }))}
    placeholder="Search Service Item..."
    isDisabled={isEditMode}
    isClearable
  />

  {isEditMode && (
    <small className="text-muted">
      Service item cannot be changed
    </small>
  )}

  {/* {serviceItems.length === 0 && (
    <small className="text-danger">
      No service items found
    </small>
  )} */}
</div>

              <div className="col-md-6">
                <label className="formlabel">Preferred Service Date</label>
                <input
                  type="date"
                  name="preferred_date"
                  value={form.preferred_date}
                  onChange={handleChange}
                  className="form-control"
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="formlabel">Preferred Service Time</label>
                <input
                  type="time"
                  name="preferred_time"
                  value={form.preferred_time}
                  onChange={handleChange}
                  className="form-control"
                  required
                />
              </div>

              {/* Problem Type Field - Added after Preferred Time */}
              <div className="col-md-6">
                <label className="formlabel">Problem Type</label>
                <select
                  name="problem_type"
                  value={form.problem_type}
                  onChange={handleChange}
                  className="form-control"
                >
                  <option value="">Select Problem Type (Optional)</option>
                  {problemTypes.length === 0 ? (
                    <option value="" disabled>Loading problem types...</option>
                  ) : (
                    problemTypes.map((problemType) => (
                      <option key={problemType.problem_type_id} value={problemType.problem_type_id}>
                        {problemType.name}
                      </option>
                    ))
                  )}
                </select>
                <small className="text-muted">Select the type of problem you're experiencing</small>
              </div>

              <div className="col-12">
                <label className="formlabel">Request Details</label>
                <textarea
                  name="request_details"
                  value={form.request_details}
                  onChange={handleChange}
                  className="form-control"
                  rows="4"
                  required
                />
              </div>

              {/* File Upload Section */}
              <div className="col-12">
                <label className="formlabel">
                  {isEditMode ? 'Manage Images & Videos' : 'Upload Images & Videos (Optional)'}
                </label>
                <div className="file-upload-section">
                  <div className="file-upload-area">
                    <input
                      type="file"
                      id="file-upload"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleFileChange}
                      className="file-input"
                    />
                    <label htmlFor="file-upload" className="file-upload-label">
                      <FaUpload className="me-2" />
                      {isEditMode ? 'Add More Files' : 'Choose Images & Videos'}
                    </label>
                    <small className="text-muted d-block mt-2">
                      Supported formats: JPG, PNG, GIF, MP4, AVI, MOV. Max file size: 50MB
                    </small>
                  </div>

                  {/* Existing Media Files (Edit Mode Only) */}
                  {isEditMode && existingMedia.length > 0 && (
                    <div className="existing-media mt-4">
                      <h6>Existing Media Files ({existingMedia.length}):</h6>
                      <div className="file-list">
                        {existingMedia.map((media) => (
                          <div key={media.media_id} className="file-item existing-file">
                            <div className="file-info">
                              {media.media_type === 'Image' ? (
                                <FaImage className="file-icon text-success" />
                              ) : (
                                <FaVideo className="file-icon text-warning" />
                              )}
                              <div className="file-details">
                                <span className="file-name">{getFileNameFromPath(media.file)}</span>
                                <span className="file-type">{media.media_type}</span>
                                <span className="file-date">
                                  Uploaded: {new Date(media.uploaded_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <div className="file-actions">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary me-2"
                                onClick={() => viewMedia(media)}
                                title="View File"
                                disabled={deletingMedia.includes(media.media_id)}
                              >
                                <FaEye />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDeleteMedia(media)}
                                title="Delete File"
                                disabled={deletingMedia.includes(media.media_id)}
                              >
                                {deletingMedia.includes(media.media_id) ? (
                                  <div className="spinner-border spinner-border-sm" role="status">
                                    <span className="visually-hidden">Deleting...</span>
                                  </div>
                                ) : (
                                  <FaTrash />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New Selected Files */}
                  {selectedFiles.length > 0 && (
                    <div className="selected-files mt-3">
                      <h6>New Files to Upload ({selectedFiles.length}):</h6>
                      <div className="file-list">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="file-item">
                            <div className="file-info">
                              {file.type.startsWith('image/') ? (
                                <FaImage className="file-icon text-primary" />
                              ) : (
                                <FaVideo className="file-icon text-danger" />
                              )}
                              <div className="file-details">
                                <span className="file-name">{file.name}</span>
                                <span className="file-size">{formatFileSize(file.size)}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => removeFile(index)}
                            >
                              <FaTimes />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="service-request-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="submit-btn" 
                  disabled={isSubmitting}
                >
                  {isSubmitting 
                    ? (isEditMode ? 'Updating...' : 'Submitting...') 
                    : (isEditMode ? 'Update Request' : 'Submit Request')
                  }
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <NavScreen />
    </div>
  );
};

export default ServiceRequestForm;