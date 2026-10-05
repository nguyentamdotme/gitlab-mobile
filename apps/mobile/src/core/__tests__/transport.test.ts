import { readBounded } from "../gitlab/transport";
import { response } from "./helpers";
import { artifactResponse } from "../gitlab/artifact-transport";
test("artifact CDN redirects drop bearer and never restore it after returning to GitLab", async () => {
  const first =
    "https://gitlab.example/team/api/v4/projects/1/jobs/2/artifacts";
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(
      response({}, 302, { location: "https://cdn.example/signed-file" }),
    )
    .mockResolvedValueOnce(response({}, 302, { location: first }))
    .mockResolvedValueOnce(response("zip"));
  await artifactResponse(
    fetcher,
    "https://gitlab.example/team",
    first,
    "synthetic-access",
    new AbortController().signal,
  );
  expect(fetcher.mock.calls[0][1].headers).toEqual({
    Authorization: "Bearer synthetic-access",
  });
  expect(fetcher.mock.calls[1][1].headers).toEqual({});
  expect(fetcher.mock.calls[2][1].headers).toEqual({});
  expect(
    fetcher.mock.calls.every(
      (call) => call[1].redirect === "manual" && call[1].credentials === "omit",
    ),
  ).toBe(true);
});
test("artifact redirects reject insecure targets and bounded loops", async () => {
  const start = "https://gitlab.example/api/v4/projects/1/jobs/2/artifacts";
  const insecure = jest.fn(async () =>
    response({}, 302, { location: "http://cdn.example/file" }),
  );
  await expect(
    artifactResponse(
      insecure,
      "https://gitlab.example",
      start,
      "synthetic-access",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(insecure).toHaveBeenCalledTimes(1);
  const loop = jest.fn(async () => response({}, 302, { location: start }));
  await expect(
    artifactResponse(
      loop,
      "https://gitlab.example",
      start,
      "synthetic-access",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(loop).toHaveBeenCalledTimes(6);
});
test("cap cancels oversized Content-Length before body consumption", async () => {
  const controller = new AbortController();
  const result = response("x", 200, { "content-length": "9000" });
  await expect(readBounded(result, 5, controller)).rejects.toThrow();
  expect(controller.signal.aborted).toBe(true);
});
test("chunked body aborts at cap without retaining all bytes", async () => {
  const controller = new AbortController();
  const result = response(null, 200, {}, [
    new Uint8Array(3),
    new Uint8Array(4),
    new Uint8Array(100),
  ]);
  await expect(readBounded(result, 5, controller)).rejects.toThrow();
  expect(controller.signal.aborted).toBe(true);
});
test("small binary fixture is reconstructed byte exactly", async () => {
  const result = response(null, 200, {}, [
    new Uint8Array([0, 255]),
    new Uint8Array([128, 9]),
  ]);
  expect(await readBounded(result, 4)).toEqual(
    new Uint8Array([0, 255, 128, 9]),
  );
});
