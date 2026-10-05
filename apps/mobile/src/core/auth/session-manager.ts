import { Account, Credential, accountKey, SessionError } from "./types";
import type { CredentialStore } from "./credential-store";

export type SessionState =
  | "disconnected"
  | "restoring"
  | "authenticated"
  | "refreshing"
  | "locked"
  | "temporarily-offline"
  | "refresh-outcome-unknown"
  | "reconnect-required";
export type Refresh = (
  record: Credential,
  signal: AbortSignal,
) => Promise<Credential>;
export class SessionManager {
  record: Credential | null = null;
  state: SessionState = "disconnected";
  private epoch = 0;
  private flight?: Promise<Credential>;
  private controller = new AbortController();
  private persistence: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private resumeState: SessionState = "authenticated";
  constructor(
    private store: CredentialStore,
    private refresh: Refresh,
    private now = Date.now,
  ) {}
  get signal() {
    return this.controller.signal;
  }
  get generation() {
    return this.epoch;
  }
  get account(): Account | null {
    const r = this.record;
    return r
      ? {
          instance: r.instance,
          userId: r.userId,
          username: r.username,
          kind: r.kind,
        }
      : null;
  }
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const work = this.persistence.then(operation, operation);
    this.persistence = work.catch(() => undefined);
    return work;
  }
  private reset() {
    this.epoch++;
    this.controller.abort();
    this.controller = new AbortController();
    this.flight = undefined;
    this.record = null;
    this.state = "disconnected";
    this.emit();
  }
  async restore(account?: Account) {
    this.reset();
    const epoch = this.epoch;
    this.state = "restoring";
    this.emit();
    try {
      await this.persistence;
      const active = account || (await this.store.active());
      const record = active ? await this.store.load(active) : null;
      if (epoch !== this.epoch) return;
      this.record = record;
      this.state = record?.rotationPending
        ? "refresh-outcome-unknown"
        : record
          ? "authenticated"
          : "disconnected";
      if (active)
        await this.enqueue(() =>
          epoch === this.epoch
            ? this.store.setActive(active)
            : Promise.resolve(),
        );
    } catch {
      if (epoch === this.epoch) this.state = "reconnect-required";
    }
    if (epoch === this.epoch) this.emit();
  }
  async connect(record: Credential) {
    this.reset();
    const epoch = this.epoch;
    await this.enqueue(async () => {
      if (epoch !== this.epoch)
        throw new SessionError("Tài khoản đã thay đổi.");
      await this.store.save(record);
      if (epoch !== this.epoch) return;
      await this.store.setActive(record);
    });
    if (epoch !== this.epoch) throw new SessionError("Tài khoản đã thay đổi.");
    this.record = record;
    this.state = "authenticated";
    this.emit();
  }
  lock() {
    if (this.record) {
      this.resumeState =
        this.state === "refreshing" ? "refresh-outcome-unknown" : this.state;
      this.controller.abort();
      this.controller = new AbortController();
      this.state = "locked";
      this.emit();
    }
  }
  unlock() {
    if (this.record) {
      this.state = this.resumeState;
      this.emit();
    }
  }
  async ensureToken(force = false): Promise<Credential> {
    const record = this.record;
    if (
      !record ||
      ["locked", "reconnect-required", "refresh-outcome-unknown"].includes(
        this.state,
      )
    )
      throw new SessionError("Hãy mở khóa hoặc kết nối lại GitLab.");
    if (
      record.kind === "pat" ||
      (!force && (record.expiresAt || 0) > this.now() + 60_000)
    )
      return record;
    if (this.flight) return this.flight;
    const epoch = this.epoch;
    const signal = this.signal;
    this.state = "refreshing";
    this.emit();
    const work = (async () => {
      try {
        await this.enqueue(async () => {
          if (epoch !== this.epoch || signal.aborted)
            throw new SessionError("Phiên đã thay đổi.");
          await this.store.save({ ...record, rotationPending: true });
        });
        if (epoch !== this.epoch || signal.aborted)
          throw new SessionError("Phiên đã thay đổi.");
        const next = await this.refresh(record, signal);
        if (epoch !== this.epoch || signal.aborted)
          throw new SessionError("Phiên đã thay đổi.");
        await this.enqueue(async () => {
          if (epoch !== this.epoch)
            throw new SessionError("Phiên đã thay đổi.");
          await this.store.save({ ...next, rotationPending: false });
        });
        if (epoch !== this.epoch || signal.aborted)
          throw new SessionError("Phiên đã thay đổi.");
        this.record = next;
        this.state = "authenticated";
        this.emit();
        return next;
      } catch (error) {
        if (
          epoch === this.epoch &&
          error instanceof RefreshFailure &&
          error.state === "temporarily-offline"
        ) {
          await this.enqueue(() =>
            this.store.save({ ...record, rotationPending: false }),
          ).catch(() => undefined);
        }
        if (epoch === this.epoch && this.state !== "locked") {
          this.state =
            error instanceof RefreshFailure
              ? error.state
              : "reconnect-required";
          this.emit();
        }
        throw error;
      }
    })();
    this.flight = work;
    try {
      return await work;
    } finally {
      if (this.flight === work) this.flight = undefined;
    }
  }
  async logout() {
    const account = this.account;
    this.reset();
    await this.enqueue(async () => {
      if (account) await this.store.remove(account);
      await this.store.setActive(null);
    });
  }
  markUnauthorized() {
    this.state = "reconnect-required";
    this.emit();
  }
  sameAccount(account: Account) {
    return this.account && accountKey(this.account) === accountKey(account);
  }
}
export class RefreshFailure extends SessionError {
  constructor(
    public state:
      "temporarily-offline" | "refresh-outcome-unknown" | "reconnect-required",
    message: string,
  ) {
    super(message);
  }
}
