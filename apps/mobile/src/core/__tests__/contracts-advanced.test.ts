import {
  projectSchema,
  issueSchema,
  pipelineSchema,
  jobSchema,
  mrSchema,
  deploymentSchema,
} from "../gitlab/types";
import { supportsInputs } from "../gitlab/capabilities";
import { GitLabApi } from "../../features/gitlab-api";
import { SessionManager } from "../auth/session-manager";
import { GitLabClient } from "../gitlab/client";
import { credential, MemoryStore, response } from "./helpers";
import fixture from "../../../../../tests/fixtures/gitlab/compatibility.json";
test("missing/null/unknown fields are forward compatible while IDs are required", () => {
  expect(projectSchema.parse(fixture.project).default_branch).toBeNull();
  expect(pipelineSchema.parse(fixture.pipeline).status).toBe("future-status");
  expect(jobSchema.parse(fixture.job).runner).toBeNull();
  expect(deploymentSchema.parse(fixture.deployment).deployable).toBeNull();
  expect(issueSchema.parse(fixture.issue).iid).toBe(7);
  expect(mrSchema.parse(fixture.mr).iid).toBe(8);
  expect(() => pipelineSchema.parse({ status: "success" })).toThrow();
});
test.each([undefined, "unknown", "17.11.0", "18.0.4"])(
  "inputs conservatively disabled below GA %s",
  (version) => expect(supportsInputs(version)).toBe(false),
);
test.each(["18.1.0", "18.1.0-ee", "19.0.0"])(
  "inputs GA enabled for supported version %s",
  (version) => expect(supportsInputs(version)).toBe(true),
);
test("MR revision guard refuses approve/merge against new HEAD", async () => {
  const session = new SessionManager(new MemoryStore(), async () =>
    credential(),
  );
  await session.connect(credential());
  const fetcher = jest
    .fn()
    .mockResolvedValue(response({ ...fixture.mr, sha: "new-head" }));
  const api = new GitLabApi(new GitLabClient(session, fetcher));
  await expect(api.guardMr(4, 8, "old-head")).rejects.toThrow("revision");
  expect(fetcher.mock.calls[0][1].method).toBe("GET");
});
