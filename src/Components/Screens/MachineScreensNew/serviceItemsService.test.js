import {
  clearServiceItemsCache,
  fetchCustomerServiceItems,
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
