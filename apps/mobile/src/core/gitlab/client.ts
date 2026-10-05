import type { SessionManager } from "../auth/session-manager";
import { isTrustedApi, segment } from "../security/trusted-url";
import { GitLabError } from "./errors";
import { Fetcher, readBounded } from "./transport";
export type Params = Record<string, string | number | boolean | undefined>;
export interface Page<T> {
  items: T[];
  next?: number;
}
export const projectPath = (id: number) => `/projects/${segment(id)}`;
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
export class GitLabClient {
  constructor(
    public session: SessionManager,
    private fetcher: Fetcher,
  ) {}
  url(path: string, params: Params = {}) {
    const instance = this.session.account?.instance;
    if (!instance) throw new Error("No session");
    const url = new URL(`${instance}/api/v4${path}`);
    if (!isTrustedApi(instance, url.toString()))
      throw new Error("Untrusted API URL");
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) url.searchParams.set(key, String(value));
    return url.toString();
  }
  async request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      params?: Params;
      signal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    const method = options.method || "GET";
    const url = this.url(path, options.params);
    const accountEpoch = this.session.generation;
    const sessionSignal = this.session.signal;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.session.ensureToken();
      if (accountEpoch !== this.session.generation || sessionSignal.aborted)
        throw new Error("Account changed");
      const signal = AbortSignal.any([
        sessionSignal,
        ...(options.signal ? [options.signal] : []),
        AbortSignal.timeout(20_000),
      ]);
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method,
          signal,
          redirect: "manual",
          credentials: "omit",
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch (error) {
        if (
          method !== "GET" ||
          attempt >= 2 ||
          sessionSignal.aborted ||
          options.signal?.aborted
        )
          throw error;
        await wait(500 * 2 ** attempt, signal);
        continue;
      }
      if (accountEpoch !== this.session.generation || sessionSignal.aborted) {
        await response.body?.cancel();
        throw new Error("Account changed");
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error("API redirect refused");
      }
      if (
        response.status === 401 &&
        method === "GET" &&
        !refreshed &&
        token.kind === "oauth"
      ) {
        await response.body?.cancel();
        await this.session.ensureToken(true);
        refreshed = true;
        continue;
      }
      if (response.status === 401) this.session.markUnauthorized();
      if (response.ok) return response;
      await response.body?.cancel();
      const raw = response.headers.get("retry-after");
      const delay =
        raw && /^\d+$/.test(raw)
          ? Number(raw) * 1000
          : raw
            ? Math.max(0, Date.parse(raw) - Date.now())
            : 0;
      if (
        method === "GET" &&
        attempt < 2 &&
        [429, 502, 503, 504].includes(response.status) &&
        delay <= 30_000
      ) {
        await wait(
          delay || 500 * 2 ** attempt + Math.random() * 200,
          sessionSignal,
        );
        continue;
      }
      throw new GitLabError(response.status, delay);
    }
  }
  async json<T>(
    path: string,
    options: Parameters<GitLabClient["request"]>[1] = {},
  ): Promise<T> {
    const epoch = this.session.generation;
    const signal = this.session.signal;
    const response = await this.request(path, options);
    if (response.status === 204) {
      await response.body?.cancel();
      return undefined as T;
    }
    const data = await readBounded(response, 4 * 1024 * 1024);
    if (epoch !== this.session.generation || signal.aborted)
      throw new Error("Account changed");
    return JSON.parse(new TextDecoder().decode(data)) as T;
  }
  async page<T>(
    path: string,
    params: Params = {},
    signal?: AbortSignal,
  ): Promise<Page<T>> {
    const epoch = this.session.generation;
    const accountSignal = this.session.signal;
    const response = await this.request(path, {
      params: { ...params, per_page: 30 },
      signal,
    });
    const data: unknown = JSON.parse(
      new TextDecoder().decode(await readBounded(response, 4 * 1024 * 1024)),
    );
    if (
      epoch !== this.session.generation ||
      accountSignal.aborted ||
      signal?.aborted
    )
      throw new Error("Account changed");
    if (!Array.isArray(data)) throw new Error("Invalid list response");
    let next = Number(response.headers.get("x-next-page")) || undefined;
    const link = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/);
    if (link) {
      const candidate = new URL(link[1], this.url(path, params));
      const original = new URL(this.url(path, params));
      if (
        !isTrustedApi(this.session.account!.instance, candidate.toString()) ||
        candidate.pathname !== original.pathname
      )
        throw new Error("Unsafe pagination");
      for (const [key, value] of original.searchParams)
        if (
          !["page", "per_page"].includes(key) &&
          candidate.searchParams.get(key) !== value
        )
          throw new Error("Pagination changed filter");
      next = Number(candidate.searchParams.get("page")) || next;
    }
    if (
      next &&
      (!Number.isSafeInteger(next) || next <= Number(params.page || 1))
    )
      throw new Error("Invalid next page");
    return { items: data as T[], next };
  }
}
