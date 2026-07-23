const SERVICE_ITEMS_CACHE_MS = 30000;

const cache = new Map();
const requests = new Map();

export function clearServiceItemsCache() {
  cache.clear();
  requests.clear();
}

export async function fetchCustomerServiceItems(baseURL, userId, companyId) {
  if (!userId || !companyId) return [];

  const key = `${baseURL}|${userId}|${companyId}`;
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (requests.has(key)) return requests.get(key);

  const request = (async () => {
    const response = await fetch(
      `${baseURL}/service-items/?user_id=${encodeURIComponent(userId)}&company_id=${encodeURIComponent(companyId)}`
    );
    if (!response.ok) throw new Error("Failed to fetch service items");
    const data = await response.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    cache.set(key, { value: items, expiresAt: Date.now() + SERVICE_ITEMS_CACHE_MS });
    return items;
  })();

  requests.set(key, request);
  try {
    return await request;
  } finally {
    if (requests.get(key) === request) requests.delete(key);
  }
}
