import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { z } from "zod";
import {
  serviceSessionSchema,
  pushDataSchema,
  subscriptionPreferencesSchema,
} from "@gitlab-mobile/contracts";
import { fetcher, session } from "../../core/query/provider";
import { readBounded } from "../../core/gitlab/transport";
import { accountKey, SessionError } from "../../core/auth/types";
import { safeExternalUrl } from "../../core/security/trusted-url";
import { notificationRoute } from "./routes";

const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const recordSchema = serviceSessionSchema.extend({
  instanceId: z.string(),
  deviceId: z.string().uuid(),
  refreshing: z.boolean().optional(),
});
type ServiceRecord = z.infer<typeof recordSchema>;
const serviceKey = async (namespace: string) =>
  `service-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, namespace)}`;
const cleanupKey = "notification-cleanup-v1";
export function serviceUrl(): string | null {
  const configured = Constants.expoConfig?.extra?.notificationService;
  return typeof configured === "string" && configured
    ? safeExternalUrl(configured).replace(/\/$/, "")
    : null;
}
const accountGuard = (namespace: string, generation: number) => {
  if (
    !session.account ||
    namespace !== accountKey(session.account) ||
    generation !== session.generation
  )
    throw new SessionError("Tài khoản đã đổi.");
};
export async function serviceRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  auth?: ServiceRecord,
  gitlabToken?: string,
): Promise<T> {
  const base = serviceUrl();
  if (!base)
    throw new SessionError(
      "Push service chưa được cấu hình. API GitLab trực tiếp vẫn hoạt động.",
    );
  const response = await fetcher(base + path, {
    method,
    credentials: "omit",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(gitlabToken ? { "X-GitLab-Access-Token": gitlabToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new SessionError(
      `Notification service từ chối (HTTP ${response.status}). Kiểm tra registration, phiên và quyền GitLab.`,
    );
  }
  if (response.status === 204) {
    await response.body?.cancel();
    return undefined as T;
  }
  return JSON.parse(
    new TextDecoder().decode(await readBounded(response, 1024 * 1024)),
  ) as T;
}
export async function loadServiceRecord(
  namespace: string,
): Promise<ServiceRecord | null> {
  const raw = await SecureStore.getItemAsync(
    await serviceKey(namespace),
    options,
  );
  return raw ? recordSchema.parse(JSON.parse(raw)) : null;
}
let persistence: Promise<unknown> = Promise.resolve();
function persist<T>(work: () => Promise<T>): Promise<T> {
  const next = persistence.then(work, work);
  persistence = next.catch(() => undefined);
  return next;
}
function saveRecord(namespace: string, record: ServiceRecord, epoch: number) {
  return persist(async () => {
    accountGuard(namespace, epoch);
    const value = JSON.stringify(recordSchema.parse(record));
    if (new TextEncoder().encode(value).length > 1900)
      throw new SessionError("Service credential vượt quota.");
    await SecureStore.setItemAsync(await serviceKey(namespace), value, options);
    accountGuard(namespace, epoch);
  });
}
export async function createServiceSession(): Promise<ServiceRecord> {
  const current = session.account;
  if (!current) throw new SessionError("Kết nối GitLab trước.");
  const namespace = accountKey(current);
  const epoch = session.generation;
  const token = await session.ensureToken();
  const instances = z
    .object({
      instances: z.array(z.object({ id: z.string(), baseUrl: z.string() })),
    })
    .parse(await serviceRequest("/v1/instances"));
  const instance = instances.instances.find(
    (v) => v.baseUrl === current.instance,
  );
  if (!instance)
    throw new SessionError("Receiver chưa allowlist instance này.");
  let deviceId = await AsyncStorage.getItem("notification-device-id-v1");
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await AsyncStorage.setItem("notification-device-id-v1", deviceId);
  }
  accountGuard(namespace, epoch);
  const result = serviceSessionSchema.parse(
    await serviceRequest("/v1/session", "POST", {
      instanceId: instance.id,
      gitlabToken: token.accessToken,
      deviceId,
    }),
  );
  accountGuard(namespace, epoch);
  const record = { ...result, instanceId: instance.id, deviceId };
  await saveRecord(namespace, record, epoch);
  return record;
}
const flights = new Map<string, Promise<ServiceRecord>>();
export async function ensureServiceSession(): Promise<ServiceRecord> {
  const account = session.account;
  if (!account) throw new SessionError("Kết nối GitLab trước.");
  const namespace = accountKey(account);
  const epoch = session.generation;
  const active = flights.get(namespace);
  if (active) return active;
  const work = (async () => {
    const record = await loadServiceRecord(namespace);
    accountGuard(namespace, epoch);
    if (!record || record.refreshing)
      throw new SessionError(
        "Kết nối lại notification service để khôi phục phiên.",
      );
    if (record.expiresAt > Date.now() + 60_000) return record;
    await saveRecord(namespace, { ...record, refreshing: true }, epoch);
    const rotated = serviceSessionSchema.parse(
      await serviceRequest("/v1/session/refresh", "POST", {
        refreshToken: record.refreshToken,
        deviceId: record.deviceId,
      }),
    );
    accountGuard(namespace, epoch);
    const next = { ...record, ...rotated, refreshing: false };
    await saveRecord(namespace, next, epoch);
    accountGuard(namespace, epoch);
    return next;
  })();
  flights.set(namespace, work);
  try {
    return await work;
  } finally {
    if (flights.get(namespace) === work) flights.delete(namespace);
  }
}
export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  project_id: z.coerce.number().int().positive(),
  lease_until: z.string(),
  preferences: subscriptionPreferencesSchema,
  active: z.boolean(),
});
export async function subscriptions() {
  return z
    .object({ subscriptions: z.array(subscriptionSchema) })
    .parse(
      await serviceRequest(
        "/v1/subscriptions",
        "GET",
        undefined,
        await ensureServiceSession(),
      ),
    ).subscriptions;
}
export async function watch(
  projectId: number,
  preferences: z.infer<typeof subscriptionPreferencesSchema>,
) {
  const account = session.account;
  if (!account) throw new SessionError("Kết nối GitLab trước.");
  const namespace = accountKey(account);
  const epoch = session.generation;
  const auth = await ensureServiceSession();
  const token = await session.ensureToken();
  accountGuard(namespace, epoch);
  return serviceRequest(
    "/v1/subscriptions",
    "POST",
    { projectId, preferences, gitlabToken: token.accessToken },
    auth,
  );
}
export async function renewSubscriptions() {
  const auth = await ensureServiceSession();
  const epoch = session.generation;
  const rows = await subscriptions();
  for (const row of rows) {
    if (epoch !== session.generation) return;
    const token = await session.ensureToken();
    await serviceRequest(
      `/v1/subscriptions/${row.id}/renew`,
      "POST",
      { gitlabToken: token.accessToken },
      auth,
    );
  }
}
export async function resolveEvent(eventId: string, accountRef: string) {
  pushDataSchema.parse({ eventId, accountRef });
  const account = session.account;
  if (!account)
    throw new SessionError("Kết nối GitLab trước khi mở thông báo.");
  const namespace = accountKey(account);
  const epoch = session.generation;
  const auth = await ensureServiceSession();
  if (auth.accountRef !== accountRef)
    throw new SessionError(
      "Thông báo thuộc phiên/tài khoản khác hoặc đã hết hạn.",
    );
  const token = await session.ensureToken();
  const route = notificationRoute(
    await serviceRequest(
      `/v1/events/${eventId}`,
      "GET",
      undefined,
      auth,
      token.accessToken,
    ),
    account,
  );
  accountGuard(namespace, epoch);
  return route;
}
export async function cleanupService(namespace: string) {
  await persist(async () => {
    const record = await loadServiceRecord(namespace);
    await SecureStore.deleteItemAsync(await serviceKey(namespace), options);
    if (record?.cleanupToken && serviceUrl()) {
      const raw = await SecureStore.getItemAsync(cleanupKey, options);
      const queue = raw
        ? z
            .array(z.object({ base: z.string(), token: z.string() }))
            .parse(JSON.parse(raw))
        : [];
      queue.push({ base: serviceUrl()!, token: record.cleanupToken });
      await SecureStore.setItemAsync(
        cleanupKey,
        JSON.stringify(queue.slice(-8)),
        options,
      );
    }
  });
  await flushCleanup();
}
export function flushCleanup() {
  return persist(async () => {
    const raw = await SecureStore.getItemAsync(cleanupKey, options);
    if (!raw) return;
    const queue = z
      .array(z.object({ base: z.string(), token: z.string() }))
      .parse(JSON.parse(raw));
    const remaining = [];
    for (const item of queue) {
      try {
        if (item.base !== serviceUrl()) {
          remaining.push(item);
          continue;
        }
        const response = await fetcher(item.base + "/v1/session/cleanup", {
          method: "DELETE",
          credentials: "omit",
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
          headers: { "X-Cleanup-Token": item.token },
        });
        await response.body?.cancel();
        if (!response.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    if (remaining.length)
      await SecureStore.setItemAsync(
        cleanupKey,
        JSON.stringify(remaining),
        options,
      );
    else await SecureStore.deleteItemAsync(cleanupKey, options);
  });
}
