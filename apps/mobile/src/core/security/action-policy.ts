import type { CiPolicy } from "../storage/preferences";
import { SessionError } from "../auth/types";
export class PolicyError extends SessionError {
  name = "PolicyError";
}
export function requireCiPolicy(
  policies: CiPolicy[],
  instance: string,
  projectId: number,
  ref: string,
  environment?: string,
): CiPolicy {
  const policy = policies.find(
    (p) => p.instance === instance && p.projectId === projectId,
  );
  if (!policy?.validated || !policy.refs.includes(ref))
    throw new PolicyError(
      "Chưa có policy đã kiểm thử cho project/ref này. CI chỉ đọc.",
    );
  if (environment && !policy.environments.includes(environment))
    throw new PolicyError("Environment chưa được policy cho phép.");
  return policy;
}
export function requireManualJob(
  job: {
    status: string;
    archived?: boolean;
    environment?: { name: string } | null;
  },
  policy: CiPolicy,
) {
  if (job.status !== "manual" || job.archived)
    throw new PolicyError("Chỉ chạy job manual chưa archived.");
  if (!job.environment || !policy.environments.includes(job.environment.name))
    throw new PolicyError("Chưa xác minh environment của job manual.");
}
export function requireVariables(
  policy: CiPolicy,
  variables: { key: string; value: string }[],
) {
  if (variables.some((v) => !policy.variables.includes(v.key)))
    throw new PolicyError("Variable chưa được policy cho phép.");
}
