import { SessionManager } from "../auth/session-manager";
import { GitLabClient } from "../gitlab/client";
import { MemoryStore, credential, response, deferred } from "./helpers";

async function client(fetcher: jest.Mock) {
  const refresh = jest.fn(async () => credential({ accessToken: "rotated" }));
  const session = new SessionManager(new MemoryStore(), refresh);
  await session.connect(credential());
  return { client: new GitLabClient(session, fetcher), refresh, session };
}
test("GET 401 refreshes once and retries, 403 never refreshes", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(response({ id: 12 }));
  const context = await client(fetcher);
  expect(await context.client.json("/user")).toEqual({ id: 12 });
  expect(context.refresh).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer rotated");
  fetcher.mockResolvedValue(response({}, 403));
  await expect(context.client.json("/user")).rejects.toMatchObject({
    status: 403,
  });
  expect(context.refresh).toHaveBeenCalledTimes(1);
});
test.each([401, 429, 500, 502, 503])(
  "POST HTTP %i is sent once",
  async (status) => {
    const fetcher = jest.fn().mockResolvedValue(response({}, status));
    const context = await client(fetcher);
    await expect(
      context.client.json("/projects/4/pipeline", {
        method: "POST",
        body: { ref: "sandbox" },
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(context.refresh).not.toHaveBeenCalled();
  },
);
test("POST lost response is sent once", async () => {
  const fetcher = jest.fn().mockRejectedValue(new Error("network timeout"));
  const context = await client(fetcher);
  await expect(
    context.client.json("/projects/4/issues", {
      method: "POST",
      body: { title: "synthetic" },
    }),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(context.session.account).not.toBeNull();
});
test("redirect is refused before a second credentialed request", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValue(
      response({}, 302, { location: "https://attacker.example" }),
    );
  const context = await client(fetcher);
  await expect(context.client.json("/projects")).rejects.toThrow("redirect");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "manual",
    credentials: "omit",
  });
});
test("subpath and encoded repository paths preserve trust boundary", async () => {
  const context = await client(jest.fn());
  expect(
    context.client.url(
      "/projects/4/repository/files/src%2Fhello%20%E4%B8%96%E7%95%8C.ts",
      { ref: "feature/foo" },
    ),
  ).toBe(
    "https://gitlab.example/team/api/v4/projects/4/repository/files/src%2Fhello%20%E4%B8%96%E7%95%8C.ts?ref=feature%2Ffoo",
  );
});
test.each([
  "https://attacker.example/api/v4/projects?page=2",
  "https://gitlab.example/team/api/v4/projects?page=2&search=other",
  "https://gitlab.example/team/api/v4/user?page=2",
])("reject hostile pagination %s", async (link) => {
  const context = await client(
    jest
      .fn()
      .mockResolvedValue(response([], 200, { link: `<${link}>; rel="next"` })),
  );
  await expect(
    context.client.page("/projects", { search: "sandbox" }),
  ).rejects.toThrow();
});
test("pagination retains filters and reads next page without total count", async () => {
  const context = await client(
    jest
      .fn()
      .mockResolvedValue(response([{ id: 1 }], 200, { "x-next-page": "2" })),
  );
  expect(await context.client.page("/projects", { search: "sandbox" })).toEqual(
    { items: [{ id: 1 }], next: 2 },
  );
});
test("late GET after switch cannot return old private data", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = jest.fn(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  const context = await client(fetcher);
  const call = context.client.json("/projects");
  const assertion = expect(call).rejects.toThrow();
  await Promise.resolve();
  await context.session.connect(credential({ userId: 30 }));
  resolve(response([{ id: 1 }]));
  await assertion;
});
test("account switch during body streaming rejects an old response even if transport ignores abort", async () => {
  const body = deferred<{ done: boolean; value: Uint8Array }>();
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let delivered = false;
  const result = response({});
  Object.assign(result, {
    body: {
      cancel: async () => undefined,
      getReader: () => ({
        read: async () => {
          if (delivered) return { done: true };
          delivered = true;
          started();
          return body.promise;
        },
        cancel: async () => undefined,
      }),
    },
  });
  const context = await client(jest.fn().mockResolvedValue(result));
  const call = context.client.json("/projects");
  const assertion = expect(call).rejects.toThrow("Account changed");
  await reading;
  await context.session.connect(credential({ userId: 30 }));
  body.resolve({ done: false, value: new TextEncoder().encode('[{"id":1}]') });
  await assertion;
});
