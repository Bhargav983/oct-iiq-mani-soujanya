import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import baseURL from "../ApiUrl/Apiurl";
import { AuthContext } from "./AuthContext";

const DelegateServiceItemContext = createContext();
const ASSIGNMENT_CACHE_KEY = "delegateServiceItemAssignments";

const readLoginAssignmentCache = (delegateId) => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ASSIGNMENT_CACHE_KEY));
    return cached?.delegateId === delegateId && Array.isArray(cached.items)
      ? cached.items
      : null;
  } catch {
    return null;
  }
};

export const DelegateServiceItemProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [serviceItems, setServiceItems] = useState([]);
  const [selectedServiceItem, setSelectedServiceItem] = useState("");
  const [serviceItemPermissions, setServiceItemPermissions] = useState({});
  const [serviceItemDetails, setServiceItemDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshRun, setRefreshRun] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchServiceItems = async () => {
      if (!user?.delegate_id) {
        setServiceItems([]);
        setSelectedServiceItem("");
        setServiceItemPermissions({});
        setServiceItemDetails({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const cachedAssignments = readLoginAssignmentCache(user.delegate_id);
        const requests = [
          axios.get(
            `${baseURL}/service-items/?user_id=${user.delegate_id}&company_id=${user.company_id}`,
            { timeout: 15000 }
          ),
        ];
        if (!cachedAssignments) {
          requests.push(
            axios.get(`${baseURL}/delegate-service-item-tasks/`, { timeout: 15000 })
          );
        }

        const [serviceItemsResponse, delegateResponse] = await Promise.all(requests);
        if (cancelled) return;

        const allDelegateItems =
          cachedAssignments || delegateResponse?.data?.data || [];
        const filteredDelegateItems = allDelegateItems.filter(
          (item) => item.delegate === user.delegate_id && !item.completed_at
        );
        setServiceItems(filteredDelegateItems);

        const allServiceItems = serviceItemsResponse.data?.data || [];
        const serviceItemsMap = Object.fromEntries(
          allServiceItems.map((item) => [item.service_item_id, item])
        );
        setServiceItemDetails(serviceItemsMap);

        const savedItemId = localStorage.getItem("selectedServiceItemId");
        const selectedAssignment =
          filteredDelegateItems.find(
            (item) => item.service_item === savedItemId
          ) || filteredDelegateItems[0];

        if (selectedAssignment) {
          setSelectedServiceItem(selectedAssignment.service_item);
          setServiceItemPermissions(selectedAssignment);
          localStorage.setItem(
            "selectedServiceItemId",
            selectedAssignment.service_item
          );
        } else {
          setSelectedServiceItem("");
          setServiceItemPermissions({});
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error("Error fetching delegate service items:", requestError);
          setError(requestError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchServiceItems();
    return () => {
      cancelled = true;
    };
  }, [user, refreshRun]);

  const updateSelectedServiceItem = useCallback(
    (serviceItemId) => {
      const foundItem = serviceItems.find(
        (item) => item.service_item === serviceItemId
      );
      if (!foundItem) return;
      setSelectedServiceItem(serviceItemId);
      setServiceItemPermissions(foundItem);
      localStorage.setItem("selectedServiceItemId", serviceItemId);
    },
    [serviceItems]
  );

  const clearSelectedServiceItem = useCallback(() => {
    setSelectedServiceItem("");
    setServiceItemPermissions({});
    localStorage.removeItem("selectedServiceItemId");
  }, []);

  const getSelectedServiceDetails = useCallback(
    () => serviceItemDetails[selectedServiceItem] || null,
    [selectedServiceItem, serviceItemDetails]
  );

  const retry = useCallback(() => setRefreshRun((run) => run + 1), []);

  return (
    <DelegateServiceItemContext.Provider
      value={{
        serviceItems,
        selectedServiceItem,
        serviceItemPermissions,
        serviceItemDetails,
        getSelectedServiceDetails,
        updateSelectedServiceItem,
        clearSelectedServiceItem,
        loading,
        error,
        retry,
      }}
    >
      {children}
    </DelegateServiceItemContext.Provider>
  );
};

export const useDelegateServiceItems = () =>
  useContext(DelegateServiceItemContext);