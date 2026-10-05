import { z } from "zod";
const id = z.number().int().positive();
export const projectSchema = z
  .object({
    id,
    name: z.string(),
    path_with_namespace: z.string(),
    default_branch: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    web_url: z.string().optional(),
  })
  .passthrough();
export const issueSchema = z
  .object({
    id,
    iid: id,
    title: z.string(),
    state: z.string(),
    description: z.string().nullable().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.object({ id, username: z.string() })).optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();
export const pipelineSchema = z
  .object({
    id,
    status: z.string(),
    ref: z.string(),
    sha: z.string(),
    source: z.string().optional(),
    web_url: z.string().optional(),
    duration: z.number().nullable().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
export const jobSchema = z
  .object({
    id,
    name: z.string(),
    status: z.string(),
    stage: z.string(),
    ref: z.string(),
    archived: z.boolean().optional(),
    allow_failure: z.boolean().optional(),
    environment: z.object({ name: z.string() }).nullable().optional(),
    pipeline: z.object({ id, sha: z.string().optional() }).optional(),
    commit: z.object({ id: z.string() }).optional(),
    artifacts_file: z
      .object({ filename: z.string().optional(), size: z.number().optional() })
      .nullable()
      .optional(),
    artifacts_expire_at: z.string().nullable().optional(),
    failure_reason: z.string().nullable().optional(),
    runner: z
      .object({ id, description: z.string().nullable().optional() })
      .nullable()
      .optional(),
  })
  .passthrough();
export const mrSchema = z
  .object({
    id,
    iid: id,
    title: z.string(),
    state: z.string(),
    sha: z.string(),
    source_branch: z.string(),
    target_branch: z.string(),
    description: z.string().nullable().optional(),
    detailed_merge_status: z.string().optional(),
    diff_refs: z
      .object({
        base_sha: z.string(),
        head_sha: z.string(),
        start_sha: z.string(),
      })
      .nullable()
      .optional(),
    head_pipeline: pipelineSchema.nullable().optional(),
    web_url: z.string().optional(),
  })
  .passthrough();
export const scheduleSchema = z
  .object({
    id,
    description: z.string(),
    ref: z.string(),
    cron: z.string(),
    cron_timezone: z.string(),
    active: z.boolean(),
    next_run_at: z.string().nullable().optional(),
    owner: z.object({ id, username: z.string() }).optional(),
  })
  .passthrough();
export const environmentSchema = z
  .object({
    id,
    name: z.string(),
    state: z.string(),
    external_url: z.string().nullable().optional(),
    last_deployment: z.unknown().nullable().optional(),
  })
  .passthrough();
export const deploymentSchema = z
  .object({
    id,
    sha: z.string(),
    ref: z.string(),
    status: z.string(),
    deployable: jobSchema.nullable().optional(),
    environment: z.object({ id, name: z.string() }).nullable().optional(),
  })
  .passthrough();
export type Project = z.infer<typeof projectSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type Pipeline = z.infer<typeof pipelineSchema>;
export type Job = z.infer<typeof jobSchema>;
export type MergeRequest = z.infer<typeof mrSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
