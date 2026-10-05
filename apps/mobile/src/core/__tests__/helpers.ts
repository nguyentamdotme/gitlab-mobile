import type { Account, Credential } from "../auth/types";
import { accountKey } from "../auth/types";
import type { CredentialStore } from "../auth/credential-store";
import type { Journal, Intent } from "../storage/mutation-journal";
export const credential = (
  overrides: Partial<Credential> = {},
): Credential => ({
  schemaVersion: 1,
  kind: "oauth",
  instance: "https://gitlab.example/team",
  userId: 12,
  username: "test-user",
  clientId: "public-id",
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: Date.now() + 7200_000,
  scopes: ["api"],
  generation: 0,
  ...overrides,
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export class MemoryStore implements CredentialStore {
  rows = new Map<string, Credential>();
  selected: Account | null = null;
  save = jest.fn(async (record: Credential) => {
    this.rows.set(accountKey(record), { ...record });
  });
  load = async (account: Account) => this.rows.get(accountKey(account)) || null;
  remove = async (account: Account) => {
    this.rows.delete(accountKey(account));
  };
  accounts = async () => [...this.rows.values()];
  active = async () => this.selected;
  setActive = async (account: Account | null) => {
    this.selected = account;
  };
}
export class MemoryJournal implements Journal {
  intent: Intent | null = null;
  save = jest.fn(async (intent: Intent) => {
    this.intent = intent;
  });
  read = async (account: string) =>
    this.intent?.account === account ? this.intent : null;
  clear = async (account: string) => {
    if (this.intent?.account === account) this.intent = null;
  };
}
export function response(
  data: unknown = {},
  status = 200,
  headers: Record<string, string> = {},
  chunks?: Uint8Array[],
): Response {
  const bytes = chunks || [
    new TextEncoder().encode(
      typeof data === "string" ? data : JSON.stringify(data),
    ),
  ];
  let index = 0;
  const cancel = jest.fn(async () => undefined);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (key: string) => headers[key.toLowerCase()] || null },
    body: {
      cancel,
      getReader: () => ({
        read: async () =>
          index < bytes.length
            ? { done: false, value: bytes[index++] }
            : { done: true, value: undefined },
        cancel,
      }),
    },
  } as unknown as Response;
}
