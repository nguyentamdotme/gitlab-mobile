import { MutationRunner } from "../gitlab/mutation-reconciliation";
import { SessionManager } from "../auth/session-manager";
import { GitLabError } from "../gitlab/errors";
import { MemoryStore, MemoryJournal, credential, deferred } from "./helpers";
import {
  requireCiPolicy,
  requireManualJob,
  requireVariables,
} from "../security/action-policy";
import { ciPolicySchema } from "../storage/preferences";
import { accountKey } from "../auth/types";
const intent = { action: "pipeline-run", projectId: 4, ref: "sandbox" };
async function setup() {
  const session = new SessionManager(new MemoryStore(), async () =>
    credential(),
  );
  await session.connect(credential());
  const journal = new MemoryJournal();
  return { session, journal, runner: new MutationRunner(session, journal) };
}
test("journal is saved before dispatch and contains metadata only", async () => {
  const { runner, journal } = await setup();
  await runner.run(intent, async () => {
    expect(journal.intent).toMatchObject(intent);
    expect(Object.keys(journal.intent!).sort()).toEqual([
      "account",
      "action",
      "generation",
      "projectId",
      "ref",
      "timestamp",
    ]);
    return 1;
  });
  expect(journal.intent).toBeNull();
});
test("double tap sends one mutation", async () => {
  const { runner } = await setup();
  const gate = deferred<number>();
  const dispatch = jest.fn(() => gate.promise);
  const first = runner.run(intent, dispatch);
  await expect(runner.run(intent, dispatch)).rejects.toThrow("Đang gửi");
  gate.resolve(1);
  await first;
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test("journal save failure prevents network dispatch", async () => {
  const { runner, journal } = await setup();
  journal.save.mockRejectedValue(new Error("quota"));
  const dispatch = jest.fn();
  await expect(runner.run(intent, dispatch)).rejects.toThrow("quota");
  expect(dispatch).not.toHaveBeenCalled();
});
test("unknown outcome survives restart and cannot replay", async () => {
  const { runner, journal, session } = await setup();
  const dispatch = jest.fn(async () => {
    throw new Error("lost response");
  });
  await expect(runner.run(intent, dispatch)).rejects.toThrow("Chưa xác định");
  const restarted = new MutationRunner(session, journal);
  await expect(restarted.run(intent, dispatch)).rejects.toThrow(
    "Chưa xác định",
  );
  expect(dispatch).toHaveBeenCalledTimes(1);
  await journal.clear(accountKey(session.account!));
  await expect(restarted.run(intent, async () => 2)).resolves.toBe(2);
});
test.each([400, 401, 403, 409, 422, 429])(
  "known rejection %i clears intent without replay",
  async (status) => {
    const { runner, journal } = await setup();
    const dispatch = jest.fn(async () => {
      throw new GitLabError(status);
    });
    await expect(runner.run(intent, dispatch)).rejects.toThrow();
    expect(journal.intent).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  },
);
test("write with read-only credential is refused", async () => {
  const { runner, session } = await setup();
  await session.connect(credential({ scopes: ["read_api"] }));
  const dispatch = jest.fn();
  await expect(runner.run(intent, dispatch)).rejects.toThrow("chỉ đọc");
  expect(dispatch).not.toHaveBeenCalled();
});
const policy = ciPolicySchema.parse({
  instance: "https://gitlab.example/team",
  projectId: 4,
  refs: ["sandbox"],
  environments: ["staging"],
  risk: "non-production",
  variables: ["ALLOWED"],
  inputsEnabled: false,
  stopEnabled: false,
  approvalsEnabled: false,
  approvalReauthentication: false,
  validated: true,
  redeploy: false,
});
test("only exact instance/project/ref matches a verified policy", () => {
  expect(requireCiPolicy([policy], policy.instance, 4, "sandbox")).toEqual(
    policy,
  );
  for (const args of [
    [policy.instance, 4, "main"],
    [policy.instance, 5, "sandbox"],
    ["https://other.example", 4, "sandbox"],
  ] as const)
    expect(() =>
      requireCiPolicy([policy], args[0], args[1], args[2]),
    ).toThrow();
  expect(() =>
    requireCiPolicy([policy], policy.instance, 4, "sandbox", "production"),
  ).toThrow();
});
test.each([
  { status: "manual", environment: null },
  { status: "scheduled", environment: { name: "staging" } },
  { status: "manual", archived: true, environment: { name: "staging" } },
  { status: "manual", environment: { name: "production" } },
])("manual play rejects unclassified/delayed/archived/unmapped job", (job) =>
  expect(() => requireManualJob(job, policy)).toThrow(),
);
test("valid manual job and allowed variable keys accepted", () => {
  expect(() =>
    requireManualJob(
      { status: "manual", environment: { name: "staging" } },
      policy,
    ),
  ).not.toThrow();
  expect(() =>
    requireVariables(policy, [{ key: "ALLOWED", value: "synthetic" }]),
  ).not.toThrow();
  expect(() =>
    requireVariables(policy, [{ key: "SECRET", value: "synthetic" }]),
  ).toThrow();
});
