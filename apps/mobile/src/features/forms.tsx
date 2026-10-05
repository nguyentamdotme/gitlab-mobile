import React, { useState } from "react";
import { router } from "expo-router";
import { z } from "zod";
import {
  Body,
  Heading,
  Field,
  Button,
  Caption,
  Copy,
  ErrorNotice,
} from "../components/ui";
import { useApp } from "../core/query/provider";
import { projectPath } from "../core/gitlab/client";
import {
  requireCiPolicy,
  requireVariables,
  PolicyError,
} from "../core/security/action-policy";
import { supportsInputs } from "../core/gitlab/capabilities";
import { RefPicker, RefChoice } from "./ref-picker";
import { useGitLabMutation } from "./mutation-action";
import { Resource } from "./gitlab-api";
import {
  pipelineSchema,
  mrSchema,
  issueSchema,
  scheduleSchema,
} from "../core/gitlab/types";
import { segment } from "../core/security/trusted-url";

export const inputSchema = z.record(
  z.string().min(1),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
);
export function validateSchedule(cron: string, timezone: string) {
  if (cron.trim().split(/\s+/).length !== 5 || !/^[\d*,/\-\s]+$/.test(cron))
    throw new PolicyError(
      "Cron cần 5 trường số/range/step; GitLab kiểm tra giá trị cuối cùng.",
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new PolicyError("Timezone IANA không hợp lệ.");
  }
}
export default function CreateResource({
  projectId,
  resource,
}: {
  projectId: number;
  resource: Resource;
}) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<RefChoice | null>(null);
  const [target, setTarget] = useState<RefChoice | null>(null);
  const [cron, setCron] = useState("0 8 * * 1-5");
  const [timezone, setTimezone] = useState("Etc/UTC");
  const [variables, setVariables] = useState("[]");
  const [inputs, setInputs] = useState("{}");
  const create = () =>
    void mutation.run(async () => {
      const path = projectPath(projectId);
      if (resource === "issues") {
        if (!title.trim()) throw new PolicyError("Issue cần tiêu đề.");
        await mutation.execute(
          "Tạo issue",
          title,
          { action: "issue-create" },
          async () =>
            issueSchema.parse(
              await mutation.api.write(`${path}/issues`, "POST", {
                title: title.trim(),
                description: body,
              }),
            ),
          {
            onResult: (issue) =>
              router.replace(`/projects/${projectId}/issues/${issue.iid}`),
          },
        );
        return;
      }
      if (resource === "merge-requests") {
        if (!source || !target || !title.trim() || source.name === target.name)
          throw new PolicyError(
            "Chọn hai branch khác nhau và nhập tiêu đề MR.",
          );
        await mutation.execute(
          "Tạo MR",
          `${source.name} → ${target.name}\n${title}`,
          { action: "mr-create", ref: source.name, sha: source.sha },
          async () =>
            mrSchema.parse(
              await mutation.api.write(`${path}/merge_requests`, "POST", {
                title: title.trim(),
                description: body,
                source_branch: source.name,
                target_branch: target.name,
              }),
            ),
          {
            onResult: (mr) =>
              router.replace(`/projects/${projectId}/merge-requests/${mr.iid}`),
          },
        );
        return;
      }
      if (!source) throw new PolicyError("Chọn ref từ GitLab trước.");
      const policy = requireCiPolicy(
        app.preferences.policies,
        app.account!.instance,
        projectId,
        source.name,
      );
      const parsedInputs = inputSchema.parse(JSON.parse(inputs));
      if (
        Object.keys(parsedInputs).length &&
        (!supportsInputs(app.version) || !policy.inputsEnabled)
      )
        throw new PolicyError("Inputs cần GitLab 18.1+ và policy CI cho phép.");
      if (resource === "pipelines") {
        const parsedVariables = z
          .array(z.object({ key: z.string().min(1), value: z.string() }))
          .parse(JSON.parse(variables));
        requireVariables(policy, parsedVariables);
        const ref = source;
        await mutation.execute(
          "Run pipeline",
          `${ref.kind} ${ref.name}\nSHA ${ref.sha}\n${parsedVariables.length} variable(s), ${Object.keys(parsedInputs).length} input(s).`,
          { action: "pipeline-run", ref: ref.name, sha: ref.sha },
          async () => {
            const endpoint = ref.kind === "branch" ? "branches" : "tags";
            const current = z
              .object({ commit: z.object({ id: z.string() }) })
              .parse(
                await mutation.api.client.json(
                  `${path}/repository/${endpoint}/${segment(ref.name)}`,
                ),
              );
            if (current.commit.id !== ref.sha)
              throw new PolicyError(
                "Ref đã đổi SHA. Hãy chọn lại ref và xác nhận.",
              );
            try {
              await mutation.api.client.json(
                `${path}/repository/${ref.kind === "branch" ? "tags" : "branches"}/${segment(ref.name)}`,
              );
              throw new PolicyError(
                "Branch và tag trùng tên. Hãy chọn ref không mơ hồ để chạy pipeline.",
              );
            } catch (error) {
              if (!(
                error &&
                typeof error === "object" &&
                "status" in error &&
                error.status === 404
              ))
                throw error;
            }
            return pipelineSchema.parse(
              await mutation.api.write(`${path}/pipeline`, "POST", {
                ref: ref.name,
                ...(parsedVariables.length
                  ? { variables: parsedVariables }
                  : {}),
                ...(Object.keys(parsedInputs).length
                  ? { inputs: parsedInputs }
                  : {}),
              }),
            );
          },
          {
            ciRef: ref.name,
            onResult: (pipeline) => {
              setVariables("[]");
              setInputs("{}");
              router.replace(`/projects/${projectId}/pipelines/${pipeline.id}`);
            },
          },
        );
        return;
      }
      if (resource === "schedules") {
        validateSchedule(cron, timezone);
        if (!title.trim()) throw new PolicyError("Schedule cần mô tả.");
        await mutation.execute(
          "Tạo schedule",
          `${title}\n${cron} (${timezone})\n${source.kind}: ${source.name}`,
          { action: "schedule-create", ref: source.name },
          async () =>
            scheduleSchema.parse(
              await mutation.api.write(`${path}/pipeline_schedules`, "POST", {
                description: title,
                ref: `refs/${source.kind === "branch" ? "heads" : "tags"}/${source.name}`,
                cron,
                cron_timezone: timezone,
                active: true,
                ...(Object.keys(parsedInputs).length
                  ? {
                      inputs: Object.entries(parsedInputs).map(
                        ([name, value]) => ({ name, value }),
                      ),
                    }
                  : {}),
              }),
            ),
          {
            ciRef: source.name,
            onResult: (schedule) =>
              router.replace(`/projects/${projectId}/schedules/${schedule.id}`),
          },
        );
      }
    });
  if (
    !["issues", "merge-requests", "pipelines", "schedules"].includes(resource)
  )
    return (
      <Body>
        <Copy>Resource này không hỗ trợ tạo mới.</Copy>
      </Body>
    );
  return (
    <Body>
      <Heading>
        {resource === "pipelines" ? "Run pipeline" : `Tạo ${resource}`}
      </Heading>
      {resource !== "pipelines" && (
        <Field label="Tiêu đề / mô tả ngắn" value={title} onChange={setTitle} />
      )}
      {["issues", "merge-requests"].includes(resource) && (
        <Field
          label="Nội dung (draft chỉ trong RAM)"
          value={body}
          onChange={setBody}
          multiline
        />
      )}
      {resource !== "issues" && (
        <RefPicker
          projectId={projectId}
          value={source}
          onChange={setSource}
          branchesOnly={resource === "merge-requests"}
          label={resource === "merge-requests" ? "Source branch" : "Ref"}
        />
      )}
      {resource === "merge-requests" && (
        <RefPicker
          projectId={projectId}
          value={target}
          onChange={setTarget}
          branchesOnly
          label="Target branch"
        />
      )}
      {resource === "pipelines" && (
        <>
          <Field
            label="Variables JSON [{key, value}]"
            value={variables}
            onChange={setVariables}
            multiline
          />
          <Caption>
            Không lưu giá trị vào lịch sử. Chỉ keys trong policy được gửi.
          </Caption>
        </>
      )}
      {resource === "schedules" && (
        <>
          <Field label="Cron (5 trường)" value={cron} onChange={setCron} />
          <Field
            label="Timezone IANA"
            value={timezone}
            onChange={setTimezone}
          />
        </>
      )}
      {["pipelines", "schedules"].includes(resource) &&
        supportsInputs(app.version) && (
          <Field
            label="Inputs JSON object (policy phải cho phép)"
            value={inputs}
            onChange={setInputs}
            multiline
          />
        )}
      <Button
        title={mutation.busy ? "Đang gửi…" : "Xem và xác nhận"}
        variant="primary"
        disabled={mutation.busy || !app.online || !!app.pendingIntent}
        onPress={create}
      />
      {!!mutation.error && <ErrorNotice error={mutation.error} />}
    </Body>
  );
}
