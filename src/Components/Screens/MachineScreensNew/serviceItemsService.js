const SERVICE_ITEMS_CACHE_MS = 30000;
const SERVICE_ITEMS_TIMEOUT_MS = 15000;

const cache = new Map();
const requests = new Map();

export function clearServiceItemsCache() {
  cache.clear();
  requests.clear();
}

export function getCachedCustomerServiceItems(baseURL, userId, companyId) {
  return cache.get(`${baseURL}|${userId}|${companyId}`)?.value || null;
}

export async function fetchCustomerServiceItems(baseURL, userId, companyId) {
  if (!userId || !companyId) return [];

  const key = `${baseURL}|${userId}|${companyId}`;
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (requests.has(key)) return requests.get(key);

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SERVICE_ITEMS_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${baseURL}/service-items/?user_id=${encodeURIComponent(userId)}&company_id=${encodeURIComponent(companyId)}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        const error = new Error(`Service items request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      const items = Array.isArray(data?.data) ? data.data : [];
      cache.set(key, { value: items, expiresAt: Date.now() + SERVICE_ITEMS_CACHE_MS });
      return items;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Service items request timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  requests.set(key, request);
  try {
    return await request;
  } finally {
    if (requests.get(key) === request) requests.delete(key);
  }
}
