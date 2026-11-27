import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import axios from 'axios';
import baseURL from '../../ApiUrl/Apiurl';

const EditServiceItemModal = ({ show, handleClose, serviceItem, userId, companyId, onUpdate, dir = undefined, lang = undefined }) => {
  const [serviceItemName, setServiceItemName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset the form when serviceItem changes
  useEffect(() => {
    if (serviceItem) {
      setServiceItemName(serviceItem.service_item_name || '');
      setError(null);
    }
  }, [serviceItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await axios.put(
        `${baseURL}/service-items/${serviceItem.service_item_id}/`,
        {
          service_item_name: serviceItemName,
          user_id: userId,
          company_id: companyId
        },
        {
          params: {
            user_id: userId,
            company_id: companyId
          }
        }
      );

      console.log('Update response:', response.data);

      if (response.data.status === "success") {
        onUpdate(response.data.data);
        handleClose();
      } else {
        setError(response.data.message || "Failed to update service item");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 
                          err.message || 
                          "An error occurred while updating";
      setError(errorMessage);
      console.error("Update error:", {
        error: err,
        response: err.response,
        message: errorMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} dir={dir} lang={lang}>
      <Modal.Header closeButton>
        <Modal.Title>Edit Service Item Name</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <div className="alert alert-danger">{error}</div>}
          <Form.Group controlId="serviceItemName">
            <Form.Label>Service Item Name</Form.Label>
            <Form.Control
              type="text"
              value={serviceItemName}
              onChange={(e) => setServiceItemName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default EditServiceItemModal;
