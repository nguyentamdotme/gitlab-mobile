import {
  normalizeInstance,
  isTrustedApi,
  safeExternalUrl,
} from "../security/trusted-url";
import { safeError } from "../security/redaction";
test.each([
  "http://gitlab.example",
  "https://user:secret@gitlab.example",
  "https://gitlab.example?token=secret",
  "https://gitlab.example/#fragment",
  "https://gitlab.example/%2e/",
])("instance rejects unsafe URL", (url) =>
  expect(() => normalizeInstance(url)).toThrow(),
);
test("keeps HTTPS subpath and port", () =>
  expect(normalizeInstance("https://gitlab.example:8443/team/")).toBe(
    "https://gitlab.example:8443/team",
  ));
test.each([
  "https://attacker.example/team/api/v4/projects",
  "https://gitlab.example/team-other/api/v4/projects",
  "https://gitlab.example/team/api/v4/projects#fragment",
])("auth is confined to origin and API subpath", (url) =>
  expect(isTrustedApi("https://gitlab.example/team", url)).toBe(false),
);
test.each([
  "javascript:alert(1)",
  "file:///tmp/trace",
  "http://gitlab.example",
  "https://token:secret@gitlab.example",
])("external links cannot execute local schemes", (url) =>
  expect(() => safeExternalUrl(url)).toThrow(),
);
test("unknown transport/server errors never echo credentials or payloads", () =>
  expect(
    safeError(
      new Error("Authorization Bearer synthetic-secret code=synthetic-code"),
    ),
  ).not.toMatch(/synthetic-secret|synthetic-code/));
