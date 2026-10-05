import * as SecureStore from "expo-secure-store";
import { notificationRoute } from "../../features/notifications/routes";
import {
  createServiceSession,
  cleanupService,
  loadServiceRecord,
} from "../../features/notifications/api";
import { session, fetcher } from "../query/provider";
import { accountKey } from "../auth/types";
import { credential, deferred, response } from "./helpers";

jest.mock("../query/provider", () => ({
  session: { account: null, generation: 1, ensureToken: jest.fn() },
  fetcher: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { notificationService: "https://push.example" } },
  },
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: jest.fn(async (_algorithm, value) =>
    value.replace(/[^a-z0-9]/gi, "-"),
  ),
  randomUUID: () => "d8f6b386-dee8-4e5b-b45f-68ac51af3c5d",
}));
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const current = credential();
const route = {
  instance: current.instance,
  userId: current.userId,
  projectId: 25,
  resource: "jobs",
  id: 80,
};
test("notification may route only to a validated resource in the current account", () => {
  expect(notificationRoute(route, current)).toEqual(route);
  expect(() => notificationRoute({ ...route, userId: 13 }, current)).toThrow();
  expect(() =>
    notificationRoute({ ...route, instance: "https://other.example" }, current),
  ).toThrow();
  expect(() =>
    notificationRoute({ ...route, resource: "../settings" }, current),
  ).toThrow();
  expect(() => notificationRoute({ ...route, id: -1 }, current)).toThrow();
});
test("server URL fields never become a notification destination", () => {
  expect(
    notificationRoute({ ...route, url: "https://untrusted.example" }, current),
  ).toEqual(route);
});
test("logout waits for an in-flight secure write and removes the late service credential", async () => {
  const rows = new Map<string, string>();
  const started = deferred<void>();
  const release = deferred<void>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => rows.get(key) || null);
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    rows.delete(key);
  });
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      if (key.startsWith("service-")) {
        started.resolve();
        await release.promise;
      }
      rows.set(key, value);
    });
  Object.assign(session, { account: current, generation: 1 });
  jest.mocked(session.ensureToken).mockResolvedValue(current);
  jest
    .mocked(fetcher)
    .mockResolvedValueOnce(
      response({ instances: [{ id: "example", baseUrl: current.instance }] }),
    );
  jest.mocked(fetcher).mockResolvedValueOnce(
    response({
      accessToken: "synthetic-service-access",
      refreshToken: "synthetic-service-refresh",
      expiresAt: Date.now() + 900_000,
      accountRef: "6c86e829-cb41-41fc-b059-e044dcf5a222",
    }),
  );
  const creation = createServiceSession();
  const rejected = expect(creation).rejects.toThrow("Tài khoản đã đổi");
  await started.promise;
  Object.assign(session, { account: null, generation: 2 });
  const cleanup = cleanupService(accountKey(current));
  release.resolve();
  await rejected;
  await cleanup;
  expect(await loadServiceRecord(accountKey(current))).toBeNull();
});
