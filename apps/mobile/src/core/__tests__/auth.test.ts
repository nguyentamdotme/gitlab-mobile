import { SessionManager, RefreshFailure } from "../auth/session-manager";
import { accountKey } from "../auth/types";
import { MemoryStore, credential, deferred } from "./helpers";
import { validateCallback, redirectUri } from "../auth/oauth";

describe("session rotation and account isolation", () => {
  test("20 parallel callers share one refresh and wait for durable pair", async () => {
    const storage = new MemoryStore();
    const rotated = deferred<ReturnType<typeof credential>>();
    const refresh = jest.fn(() => rotated.promise);
    const manager = new SessionManager(storage, refresh);
    await manager.connect(credential({ expiresAt: 0 }));
    const calls = Array.from({ length: 20 }, () => manager.ensureToken());
    rotated.resolve(
      credential({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        generation: 1,
      }),
    );
    const values = await Promise.all(calls);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(values.every((v) => v.accessToken === "new-access")).toBe(true);
    expect(storage.rows.get(accountKey(values[0]))?.refreshToken).toBe(
      "new-refresh",
    );
    expect(storage.rows.get(accountKey(values[0]))?.rotationPending).toBe(
      false,
    );
  });
  test("refresh response after logout cannot recreate removed credentials", async () => {
    const storage = new MemoryStore();
    const rotated = deferred<ReturnType<typeof credential>>();
    const manager = new SessionManager(storage, () => rotated.promise);
    await manager.connect(credential({ expiresAt: 0 }));
    const call = manager.ensureToken();
    const rejection = expect(call).rejects.toThrow();
    await manager.logout();
    rotated.resolve(credential({ accessToken: "late" }));
    await rejection;
    expect(manager.account).toBeNull();
    expect(storage.rows.size).toBe(0);
  });
  test("account switch isolates delayed refresh", async () => {
    const storage = new MemoryStore();
    const rotated = deferred<ReturnType<typeof credential>>();
    const refresh = jest.fn(() => rotated.promise);
    const manager = new SessionManager(storage, refresh);
    const second = credential({ userId: 20, username: "second" });
    await storage.save(second);
    await manager.connect(credential({ expiresAt: 0 }));
    const call = manager.ensureToken();
    const rejection = expect(call).rejects.toThrow();
    await manager.restore(second);
    rotated.resolve(credential({ accessToken: "late-first" }));
    await rejection;
    expect(manager.record?.userId).toBe(20);
    expect(manager.record?.accessToken).not.toBe("late-first");
  });
  test.each(["refresh-outcome-unknown", "reconnect-required"] as const)(
    "uncertain refresh never automatically retries (%s)",
    async (state) => {
      const storage = new MemoryStore();
      const refresh = jest.fn(async () => {
        throw new RefreshFailure(state, "fixture");
      });
      const manager = new SessionManager(storage, refresh);
      await manager.connect(credential({ expiresAt: 0 }));
      await expect(manager.ensureToken()).rejects.toThrow();
      await expect(manager.ensureToken()).rejects.toThrow();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(manager.state).toBe(state);
      const restarted = new SessionManager(storage, refresh);
      await restarted.restore();
      expect(restarted.state).toBe("refresh-outcome-unknown");
      await expect(restarted.ensureToken()).rejects.toThrow();
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );
  test("save failure after server rotation never publishes a new pair", async () => {
    const storage = new MemoryStore();
    const manager = new SessionManager(storage, async () =>
      credential({ accessToken: "rotated" }),
    );
    await manager.connect(credential({ expiresAt: 0 }));
    storage.save.mockImplementation(async (record) => {
      if (record.accessToken === "rotated")
        throw new Error("SecureStore quota");
      storage.rows.set(accountKey(record), record);
    });
    await expect(manager.ensureToken()).rejects.toThrow("quota");
    expect(manager.record?.accessToken).toBe("synthetic-access");
    expect(manager.state).toBe("reconnect-required");
  });
  test("429 preserves session and allows later foreground refresh", async () => {
    const storage = new MemoryStore();
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(
        new RefreshFailure("temporarily-offline", "rate limit"),
      )
      .mockResolvedValue(credential());
    const manager = new SessionManager(storage, refresh);
    await manager.connect(credential({ expiresAt: 0 }));
    await expect(manager.ensureToken()).rejects.toThrow();
    expect(manager.account?.userId).toBe(12);
    await manager.ensureToken();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  test("PAT does not refresh", async () => {
    const refresh = jest.fn();
    const manager = new SessionManager(new MemoryStore(), refresh);
    await manager.connect(credential({ kind: "pat", expiresAt: 0 }));
    await manager.ensureToken();
    expect(refresh).not.toHaveBeenCalled();
  });
  test.each([7, 30])(
    "fake-clock %i-day foreground refresh uses response lifetime",
    async (days) => {
      let now = 1_000_000;
      const store = new MemoryStore();
      const refresh = jest.fn(async () =>
        credential({ expiresAt: now + 120_000 }),
      );
      const manager = new SessionManager(store, refresh, () => now);
      await manager.connect(credential({ expiresAt: now + 90_000 }));
      now += days * 86_400_000;
      await manager.ensureToken();
      await manager.ensureToken();
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );
  test("lock interrupts refresh and unlock does not replay the old pair", async () => {
    const gate = deferred<ReturnType<typeof credential>>();
    const refresh = jest.fn(() => gate.promise);
    const manager = new SessionManager(new MemoryStore(), refresh);
    await manager.connect(credential({ expiresAt: 0 }));
    const call = manager.ensureToken();
    const rejected = expect(call).rejects.toThrow();
    manager.lock();
    manager.unlock();
    gate.resolve(credential());
    await rejected;
    expect(manager.state).toBe("reconnect-required");
    await expect(manager.ensureToken()).rejects.toThrow();
  });
});
describe("OAuth callback trust", () => {
  const callback = `${redirectUri}?state=expected&code=synthetic-code`;
  test("exact redirect and state accepted within TTL", () =>
    expect(validateCallback(callback, "expected", 100, 200)).toBe(
      "synthetic-code",
    ));
  test.each([
    callback.replace("expected", "forged"),
    callback.replace("oauth", "attacker"),
    callback.replace("/callback", "/other"),
    callback + "&state=expected",
    callback + "&code=other",
    callback + "#fragment",
    callback + "&error=access_denied",
  ])("rejects invalid callback %s", (url) =>
    expect(() => validateCallback(url, "expected", 100, 200)).toThrow(),
  );
  test("expired flow rejected", () =>
    expect(() =>
      validateCallback(callback, "expected", 100, 600_101),
    ).toThrow());
});
