// import React, { useEffect, useState, useContext } from 'react';
// import { AuthContext } from "../../AuthContext/AuthContext";
// import { useNavigate } from 'react-router-dom';
// import NavScreen from '../../../Components/Screens/Navbar/Navbar';
// import './AddDelegate.css'
// import baseURL from '../../ApiUrl/Apiurl';

// const AddDelegate = () => {
//   const { user } = useContext(AuthContext);
//   const userId = user?.customer_id;
//   const navigate = useNavigate();
  
// const [form, setForm] = useState({
//   service_item: '',
//   delegate_mobile: '',
//   delegate_email: '',
//   delegate_name: '',
//   customer: userId,
//   delegate_id: '',
// });

//   const [serviceItems, setServiceItems] = useState([]);
//   const [company, setCompany] = useState('');



//   useEffect(() => {
//   const fetchCustomerCompany = async () => {
//     try {
//       const response = await fetch(`${baseURL}/customers/`);
//       if (response.ok) {
//         const result = await response.json();
//         const customers = result.data || [];
//         const matchedCustomer = customers.find(c => c.customer_id === userId);
//         if (matchedCustomer) {
//           setCompany(matchedCustomer.company);
//         }
//       } else {
//         console.error("Failed to fetch customers");
//       }
//     } catch (error) {
//       console.error("Error fetching customer company:", error);
//     }
//   };

//   if (userId) {
//     fetchCustomerCompany();
//   }
// }, [userId]);



//   useEffect(() => {
//   const fetchDelegates = async () => {
//     try {
//       const response = await fetch(`${baseURL}/delegates/?customer=${userId}`);
//       if (response.ok) {
//         const result = await response.json();
//         const userDelegates = result.data || [];
//         const nextNumber = userDelegates.length + 1;
//         const formattedNumber = String(nextNumber).padStart(2, '0');
//         setForm(prev => ({
//           ...prev,
//           delegate_id: `${userId}-${formattedNumber}`
//         }));
//       } else {
//         console.error('Failed to fetch delegates');
//       }
//     } catch (error) {
//       console.error('Error fetching delegates:', error);
//     }
//   };

//   if (userId) {
//     fetchDelegates();
//   }
// }, [userId]);


//   // Generate delegate ID
//   const delegate_id = Math.floor(Math.random() * 1000000).toString();

//   // Fetch service items
//   useEffect(() => {
//     const fetchServiceItems = async () => {
//       try {
//         const response = await fetch(`${baseURL}/service-items/`);
//         if (response.ok) {
//           const result = await response.json();
//           const serviceItemsArray = result.data;
//           const filteredItems = serviceItemsArray.filter(item => item.customer === userId);
//           setServiceItems(filteredItems);
//         } else {
//           console.error('Failed to fetch service items');
//         }
//       } catch (error) {
//         console.error('Error fetching service items:', error);
//       }
//     };

//     fetchServiceItems();
//   }, [userId]);

//   const handleChange = (e) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };

// const handleSubmit = async (e) => {
//   e.preventDefault();

//   const payload = {
//     delegate_mobile: form.delegate_mobile,
//     delegate_email: form.delegate_email,
//     delegate_name: form.delegate_name,
//     status: "Active",
//     is_registered: true,
//     password: form.delegate_mobile, // or create a better one
//     security_question1: "What is your mother’s maiden name?",
//     answer1: "default",
//     security_question2: "What is your mother’s maiden name?",
//     answer2: "default",
//     recalled_at: new Date().toISOString(),
//     fcm_token: "string",
//     company: company,
//     customer: userId
//   };

//   try {
//     const response = await fetch(`${baseURL}/delegates/`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(payload),
//     });

//     if (response.ok) {
//       alert('Delegate added successfully!');
//       navigate('/view-delegates');
//     } else {
//       const errorData = await response.json();
//       console.error('API error:', errorData);
//       alert('Failed to add delegate: ' + (errorData.message || 'Unknown error'));
//     }
//   } catch (error) {
//     console.error('Error submitting form:', error);
//     alert('An error occurred. Please try again later.');
//   }
// };


//   return (
//     <div className="container add-delegate-form">
//       <div className="card">
//         <div className="card-header">
//           <h5 className="mb-1">Add Delegate</h5>
//           {/* <p>{userId}</p> */}
//        {/* <p>{company}</p> */}
//           <h6 className="text" style={{ color: 'white' }}>
//             Please fill in the delegate details
//           </h6>
//         </div>
//         <div className="card-body">
//           <form onSubmit={handleSubmit}>
//             <div className="row g-3">
//               <div className="col-md-6">
//   <label className="formlabel" style={{ marginLeft: '-155px' }}>Delegate Name</label>
//   <input
//     type="text"
//     name="delegate_name"
//     value={form.delegate_name}
//     onChange={handleChange}
//     className="form-control"
//     placeholder="Enter delegate name"
//     required
//   />
// </div>

// <div className="col-md-6">
//   <label className="formlabel" style={{ marginLeft: '-155px' }}>Delegate Email</label>
//   <input
//     type="email"
//     name="delegate_email"
//     value={form.delegate_email}
//     onChange={handleChange}
//     className="form-control"
//     placeholder="Enter delegate email"
//     required
//   />
// </div>
//               {/* <div className="col-md-6">
//                 <label className="formlabel" style={{ marginLeft: '-155px' }}>Service Item</label>
//                 <select
//                   name="service_item"
//                   value={form.service_item}
//                   onChange={handleChange}
//                   className="form-control"
//                   required
//                 >
//                   <option value="">Select Service Item</option>
//                   {serviceItems.length === 0 ? (
//                     <option value="" disabled>No service items found</option>
//                   ) : (
//                     serviceItems.map((item) => (
//                       <option key={item.service_item_id} value={item.service_item_id}>
//                         {item.service_item_id} - {item.serial_number}
//                       </option>
//                     ))
//                   )}
//                 </select>
//               </div> */}

//               <div className="col-md-6">
//                 <label className="formlabel" style={{ marginLeft: '-155px' }}>Mobile Number</label>
//                 <input
//                   type="tel"
//                   name="delegate_mobile"
//                   value={form.delegate_mobile}
//                   onChange={handleChange}
//                   className="form-control"
//                   placeholder="Enter 10-digit mobile number"
//                   required
//                   pattern="[0-9]{10}"
//                   title="Please enter a 10-digit mobile number"
//                 />
//               </div>

//               <div className="d-flex justify-content-center mt-3 gap-3">
//                 <button
//                   type="button"
//                   className="submit-btn"
//                   onClick={() => navigate('/view-delegates')}
//                   style={{ background: '#ccc', color: '#000' }}
//                 >
//                   Cancel
//                 </button>
//                 <button type="submit" className="submit-btn">
//                    Add Delegate
//                 </button>
//               </div>
//             </div>
//           </form>
//         </div>
//       </div>
//       <NavScreen />
//     </div>
//   );
// };

// export default AddDelegate;





import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from "../../AuthContext/AuthContext";
import { useNavigate } from 'react-router-dom';
import NavScreen from '../../../Components/Screens/Navbar/Navbar';
import './AddDelegate.css';
import baseURL from '../../ApiUrl/Apiurl';
import Swal from 'sweetalert2';

const AddDelegate = () => {
  const { user } = useContext(AuthContext);
  const userId = user?.customer_id;
  const navigate = useNavigate();
  const company_id = user?.company_id;

  const [form, setForm] = useState({
    service_item: '',
    delegate_mobile: '',
    delegate_email: '',
    delegate_name: '',
    customer: userId,
    delegate_id: '',
  });

  useEffect(() => {
    const fetchDelegates = async () => {
      try {
        const response = await fetch(`${baseURL}/delegates/?customer=${userId}`);
        if (response.ok) {
          const result = await response.json();
          const userDelegates = result.data || [];
          const nextNumber = userDelegates.length + 1;
          const formattedNumber = String(nextNumber).padStart(2, '0');
          setForm(prev => ({
            ...prev,
            delegate_id: `${userId}-${formattedNumber}`
          }));
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to fetch delegates',
            confirmButtonColor: '#d33',
          });
        }
      } catch (error) {
        console.error('Error fetching delegates:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Could not load delegate information.',
          confirmButtonColor: '#d33',
        });
      }
    };

    if (userId) {
      fetchDelegates();
    }
  }, [userId]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      delegate_mobile: form.delegate_mobile,
      delegate_email: form.delegate_email,
      delegate_name: form.delegate_name,
      status: "Active",
      is_registered: false,
      password: form.delegate_mobile,
      recalled_at: new Date().toISOString(),
      fcm_token: "string",
      company: company_id,
      customer: userId
    };

    try {
      console.log("Starting delegate creation process...");
      console.log("Sending payload to delegates API:", payload);
      
      // First API call to create delegate
      const response = await fetch(`${baseURL}/delegates/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const delegateData = await response.json();
        console.log("Delegate created successfully:", delegateData);
        
        // Prepare history payload
        const historyPayload = {
          delegate: delegateData.id || delegateData.data.delegate_id,
          action: "Active",
          details: `Delegate ${form.delegate_name} created with email ${form.delegate_email} and phone ${form.delegate_mobile}`,
          action_date: new Date().toISOString()
        };
        
        console.log("Sending history payload:", historyPayload);
        
        // Second API call to create history record
        const historyResponse = await fetch(`${baseURL}/delegate-history/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(historyPayload),
        });

        if (historyResponse.ok) {
          console.log("Delegate history record created successfully");
          Swal.fire({
            icon: 'success',
            title: 'Success',
            text: 'Delegate added successfully with history tracking!',
            confirmButtonColor: '#3085d6',
          }).then(() => {
            navigate('/view-delegates');
          });
        } else {
          const errorData = await historyResponse.json();
          console.error("Failed to create history record:", errorData);
          Swal.fire({
            icon: 'warning',
            title: 'Partial Success',
            text: 'Delegate added but history tracking failed: ' + (errorData.message || 'Unknown error'),
            confirmButtonColor: '#d33',
          }).then(() => {
            navigate('/view-delegates');
          });
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to create delegate:", errorData);
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: errorData.message || 'Could not add delegate',
          confirmButtonColor: '#d33',
        });
      }
    } catch (error) {
      console.error('Error in delegate creation process:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Something went wrong. Please try again later.',
        confirmButtonColor: '#d33',
      });
    }
  };

  return (
    <div className="add-delegate-form">
      <div className="add-delegate-card">
        <div className="add-delegate-header">
          <h5 className="mb-1">Add Delegate</h5>
          <h6 className="text" style={{ color: 'white' }}>
            Please fill in the delegate details
          </h6>
        </div>
        <div className="add-delegate-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="formlabel" >Delegate Name</label>
                <input
                  type="text"
                  name="delegate_name"
                  value={form.delegate_name}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Enter delegate name"
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="formlabel" >Delegate Email</label>
                <input
                  type="email"
                  name="delegate_email"
                  value={form.delegate_email}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Enter delegate email"
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="formlabel" >Mobile Number</label>
                <input
                  type="tel"
                  name="delegate_mobile"
                  value={form.delegate_mobile}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Enter 10-digit mobile number"
                  required
                  pattern="[0-9]{10}"
                  title="Please enter a 10-digit mobile number"
                />
              </div>

              <div className="add-delegate-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => navigate('/view-delegates')}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="submit-btn"
                  >
                    Add Delegate
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

export default AddDelegate;
