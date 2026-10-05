import { z } from "zod";
import { GitLabClient, Params, projectPath, Page } from "../core/gitlab/client";
import {
  projectSchema,
  issueSchema,
  mrSchema,
  pipelineSchema,
  jobSchema,
  scheduleSchema,
  environmentSchema,
  deploymentSchema,
} from "../core/gitlab/types";
import { segment } from "../core/security/trusted-url";
import { PolicyError } from "../core/security/action-policy";

export const noteSchema = z
  .object({
    id: z.number(),
    body: z.string(),
    author: z.object({ username: z.string() }).optional(),
    system: z.boolean().optional(),
    resolvable: z.boolean().optional(),
    resolved: z.boolean().optional(),
  })
  .passthrough();
export const discussionSchema = z.object({
  id: z.string(),
  notes: z.array(noteSchema),
});
export const branchSchema = z.object({
  name: z.string(),
  commit: z.object({ id: z.string() }),
});
export const treeSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.enum(["tree", "blob", "commit"]),
  mode: z.string().optional(),
});
export const commitSchema = z.object({
  id: z.string(),
  short_id: z.string(),
  title: z.string(),
  message: z.string().optional(),
  author_name: z.string().optional(),
  created_at: z.string().optional(),
});
export const diffSchema = z
  .object({
    old_path: z.string(),
    new_path: z.string(),
    diff: z.string().optional(),
    too_large: z.boolean().optional(),
    collapsed: z.boolean().optional(),
    deleted_file: z.boolean().optional(),
    new_file: z.boolean().optional(),
  })
  .passthrough();
export const bridgeSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  downstream_pipeline: z
    .object({
      id: z.number(),
      project_id: z.number(),
      status: z.string(),
      ref: z.string(),
      sha: z.string(),
    })
    .nullable()
    .optional(),
});
export type Resource =
  | "issues"
  | "merge-requests"
  | "pipelines"
  | "jobs"
  | "environments"
  | "schedules"
  | "deployments";
export const resourceEndpoint = (resource: Resource) =>
  (
    ({
      "merge-requests": "merge_requests",
      schedules: "pipeline_schedules",
    }) as Partial<Record<Resource, string>>
  )[resource] || resource;
export const resourceSchema = {
  issues: issueSchema,
  "merge-requests": mrSchema,
  pipelines: pipelineSchema,
  jobs: jobSchema,
  environments: environmentSchema,
  schedules: scheduleSchema,
  deployments: deploymentSchema,
};
export class GitLabApi {
  constructor(public client: GitLabClient) {}
  async list<T extends z.ZodType>(
    path: string,
    schema: T,
    params: Params = {},
    signal?: AbortSignal,
  ): Promise<Page<z.infer<T>>> {
    const result = await this.client.page<unknown>(path, params, signal);
    return { ...result, items: result.items.map((row) => schema.parse(row)) };
  }
  projects(params: Params = {}, signal?: AbortSignal) {
    return this.list(
      "/projects",
      projectSchema,
      { membership: true, order_by: "last_activity_at", ...params },
      signal,
    );
  }
  async project(id: number, signal?: AbortSignal) {
    return projectSchema.parse(
      await this.client.json(`${projectPath(id)}`, { signal }),
    );
  }
  async detail(
    project: number,
    resource: Resource,
    id: number,
    signal?: AbortSignal,
  ) {
    return resourceSchema[resource].parse(
      await this.client.json(
        `${projectPath(project)}/${resourceEndpoint(resource)}/${segment(id)}`,
        { signal },
      ),
    );
  }
  resources(
    project: number,
    resource: Resource,
    params: Params = {},
    signal?: AbortSignal,
  ) {
    return this.list(
      `${projectPath(project)}/${resourceEndpoint(resource)}`,
      resourceSchema[resource],
      params,
      signal,
    );
  }
  branches(project: number, page = 1, signal?: AbortSignal) {
    return this.list(
      `${projectPath(project)}/repository/branches`,
      branchSchema,
      { page },
      signal,
    );
  }
  tags(project: number, page = 1, signal?: AbortSignal) {
    return this.list(
      `${projectPath(project)}/repository/tags`,
      branchSchema,
      { page },
      signal,
    );
  }
  async version() {
    for (const path of ["/metadata", "/version"]) {
      try {
        return z
          .object({ version: z.string() })
          .parse(await this.client.json(path)).version;
      } catch {
        /* Core features remain available without metadata. */
      }
    }
    return undefined;
  }
  write<T = unknown>(path: string, method: string, body?: unknown) {
    return this.client.json<T>(path, { method, body });
  }
  async guardMr(projectId: number, iid: number, expectedSha: string) {
    const latest = mrSchema.parse(
      await this.detail(projectId, "merge-requests", iid),
    );
    if (latest.sha !== expectedSha || latest.state !== "opened")
      throw new PolicyError(
        "MR đã đổi revision/trạng thái. Tải lại trước khi thao tác.",
      );
    return latest;
  }
  notes(projectId: number, iid: number, page = 1, signal?: AbortSignal) {
    return this.list(
      `${projectPath(projectId)}/issues/${iid}/notes`,
      noteSchema,
      { page, sort: "asc" },
      signal,
    );
  }
  discussions(projectId: number, iid: number, page = 1, signal?: AbortSignal) {
    return this.list(
      `${projectPath(projectId)}/merge_requests/${iid}/discussions`,
      discussionSchema,
      { page },
      signal,
    );
  }
  diffs(projectId: number, iid: number, page = 1, signal?: AbortSignal) {
    return this.list(
      `${projectPath(projectId)}/merge_requests/${iid}/diffs`,
      diffSchema,
      { page },
      signal,
    );
  }
}
