import {
  clearServiceItemsCache,
  fetchCustomerServiceItems,
  getCachedCustomerServiceItems,
} from "./serviceItemsService";

afterEach(() => {
  clearServiceItemsCache();
  jest.restoreAllMocks();
});

test("reuses duplicate service-item requests during React development mounts", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ service_item_id: "SER1" }] }),
  });

  const [first, second] = await Promise.all([
    fetchCustomerServiceItems("", "05100", "SA-GA-01"),
    fetchCustomerServiceItems("", "05100", "SA-GA-01"),
  ]);

  expect(first).toBe(second);
  expect(first).toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test("keeps the last successful service-item list available as a stale fallback", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1000);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ service_item_id: "SER1" }] }),
  });

  await fetchCustomerServiceItems("https://example.test", "05100", "SA-GA-01");
  now.mockReturnValue(32000);
  global.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

  await expect(
    fetchCustomerServiceItems("https://example.test", "05100", "SA-GA-01")
  ).rejects.toThrow("Failed to fetch");
  expect(
    getCachedCustomerServiceItems("https://example.test", "05100", "SA-GA-01")
  ).toEqual([{ service_item_id: "SER1" }]);
});

test("includes the HTTP status when the service-item API is unavailable", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 504 });

  await expect(
    fetchCustomerServiceItems("https://example.test", "05100", "SA-GA-01")
  ).rejects.toThrow("Service items request failed (504)");
});
