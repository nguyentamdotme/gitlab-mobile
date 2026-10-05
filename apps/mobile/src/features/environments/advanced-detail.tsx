import React, { useState } from "react";
import { router } from "expo-router";
import { api, useApp } from "../../core/query/provider";
import { projectPath } from "../../core/gitlab/client";
import {
  environmentSchema,
  deploymentSchema,
  scheduleSchema,
  pipelineSchema,
  jobSchema,
} from "../../core/gitlab/types";
import {
  requireCiPolicy,
  PolicyError,
} from "../../core/security/action-policy";
import { supportsInputs } from "../../core/gitlab/capabilities";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Card,
  Button,
  Status,
  SectionHeading,
  Field,
  ErrorNotice,
  useResource,
  openExternal,
} from "../../components/ui";
import { useGitLabMutation } from "../mutation-action";
import { validateSchedule, inputSchema } from "../forms";
import { RefPicker, RefChoice } from "../ref-picker";

export function DeploymentDetail({
  projectId,
  id,
}: {
  projectId: number;
  id: number;
}) {
  const query = useResource(["deployment", projectId, id], async (signal) =>
    deploymentSchema.parse(
      await api.detail(projectId, "deployments", id, signal),
    ),
  );
  return (
    <Body>
      <Heading>Deployment #{id}</Heading>
      {query.data && <Status value={query.data.status} />}
      <Copy>{query.data?.ref}</Copy>
      <Caption>SHA {query.data?.sha}</Caption>
      {query.data?.environment && (
        <Button
          title={`Environment: ${query.data.environment.name}`}
          onPress={() =>
            router.push(
              `/projects/${projectId}/environments/${query.data!.environment!.id}`,
            )
          }
        />
      )}
      {query.data?.deployable && (
        <Button
          title={`Job #${query.data.deployable.id}`}
          onPress={() =>
            router.push(
              `/projects/${projectId}/jobs/${query.data!.deployable!.id}`,
            )
          }
        />
      )}
      {!!query.error && <ErrorNotice error={query.error} />}
    </Body>
  );
}

export function EnvironmentDetail({
  projectId,
  id,
}: {
  projectId: number;
  id: number;
}) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const path = projectPath(projectId);
  const query = useResource(["environment", projectId, id], async (signal) =>
    environmentSchema.parse(
      await api.detail(projectId, "environments", id, signal),
    ),
  );
  const [page, setPage] = useState(1);
  const deployments = useResource(
    ["deployments", projectId, id, page],
    (signal) =>
      api.list(
        path + "/deployments",
        deploymentSchema,
        { page, environment: query.data?.name },
        signal,
      ),
  );
  const policy = app.preferences.policies.find(
    (p) => p.instance === app.account?.instance && p.projectId === projectId,
  );
  const disabled = mutation.busy || !!app.pendingIntent || !app.online;
  return (
    <Body>
      <Heading>{query.data?.name || `Environment #${id}`}</Heading>
      {query.data && <Status value={query.data.state} />}
      {query.data?.external_url && (
        <Button
          title="Mở environment URL"
          onPress={() =>
            void mutation.run(() => openExternal(query.data!.external_url!))
          }
        />
      )}
      <Button
        title="Stop qua on_stop workflow"
        danger
        disabled={disabled || !policy?.stopEnabled || !query.data}
        onPress={() =>
          void mutation.run(async () => {
            const latestDeployment = deployments.data?.items[0];
            if (!query.data || !latestDeployment)
              throw new PolicyError("Chưa xác định ref cho environment stop.");
            await mutation.execute(
              "Stop environment",
              `${query.data.name}\nChạy on_stop workflow, không dùng force.`,
              {
                action: "environment-stop",
                targetId: id,
                ref: latestDeployment.ref,
              },
              async () => {
                const latest = environmentSchema.parse(
                  await api.detail(projectId, "environments", id),
                );
                if (
                  latest.state !== "available" ||
                  latest.name !== query.data!.name ||
                  !policy?.stopEnabled
                )
                  throw new PolicyError(
                    "Environment không còn available hoặc policy chưa cấu hình on_stop.",
                  );
                return api.write(`${path}/environments/${id}/stop`, "POST", {
                  force: false,
                });
              },
              {
                ciRef: latestDeployment.ref,
                environment: query.data.name,
                destructive: true,
              },
            );
          })
        }
      />
      <Caption>
        Stop/redeploy/rollback chỉ mở với policy đã thử. Không có generic
        rollback database/hạ tầng.
      </Caption>
      <SectionHeading title="Lịch sử deployment" />
      {deployments.data?.items
        .filter(
          (deployment) =>
            deployment.environment?.id === id || !deployment.environment,
        )
        .map((deployment) => (
          <Card key={deployment.id}>
            <Copy>#{deployment.id}</Copy>
            <Status value={deployment.status} />
            <Caption>
              {deployment.ref} · SHA {deployment.sha}
            </Caption>
            {deployment.deployable ? (
              <Button
                title={`Mở deploy job #${deployment.deployable.id}`}
                onPress={() =>
                  router.push(
                    `/projects/${projectId}/jobs/${deployment.deployable!.id}`,
                  )
                }
              />
            ) : (
              <Caption>Deployment không có deployable job.</Caption>
            )}
            <Button
              title="Approve deployment"
              disabled={
                disabled || !policy?.approvalsEnabled || !deployment.environment
              }
              onPress={() =>
                void mutation.run(async () =>
                  mutation.execute(
                    "Approve deployment",
                    `Deployment #${deployment.id}\n${deployment.ref}\nSHA ${deployment.sha}`,
                    {
                      action: "deployment-approve",
                      targetId: deployment.id,
                      ref: deployment.ref,
                      sha: deployment.sha,
                    },
                    async () => {
                      const latest = deploymentSchema.parse(
                        await api.client.json(
                          `${path}/deployments/${deployment.id}`,
                        ),
                      );
                      if (
                        latest.sha !== deployment.sha ||
                        latest.environment?.id !== id ||
                        !policy?.approvalsEnabled
                      )
                        throw new PolicyError(
                          "Deployment đã đổi hoặc approval chưa được policy/tier xác minh.",
                        );
                      return api.write(
                        `${path}/deployments/${deployment.id}/approval`,
                        "POST",
                        { status: "approved" },
                      );
                    },
                    { ciRef: deployment.ref, environment: query.data?.name },
                  ),
                )
              }
            />
            <Button
              title="Redeploy job cũ"
              disabled={disabled || !policy?.redeploy || !deployment.deployable}
              onPress={() =>
                void mutation.run(async () => {
                  const jobId = deployment.deployable?.id;
                  if (!jobId) throw new PolicyError("Không có deployment job.");
                  await mutation.execute(
                    "Redeploy revision cũ",
                    `Deployment #${deployment.id}\nRef ${deployment.ref}\nSHA ${deployment.sha}\nĐây là redeploy, không rollback database.`,
                    {
                      action: "deployment-redeploy",
                      targetId: deployment.id,
                      ref: deployment.ref,
                      sha: deployment.sha,
                    },
                    async () => {
                      const job = jobSchema.parse(
                        await api.detail(projectId, "jobs", jobId),
                      );
                      if (
                        !policy?.redeploy ||
                        job.archived ||
                        !job.artifacts_file?.filename ||
                        (job.artifacts_expire_at &&
                          Date.parse(job.artifacts_expire_at) <= Date.now()) ||
                        job.environment?.name !== query.data?.name
                      )
                        throw new PolicyError(
                          "Job/artifact/environment không đáp ứng policy redeploy.",
                        );
                      return jobSchema.parse(
                        await api.write(`${path}/jobs/${jobId}/retry`, "POST"),
                      );
                    },
                    {
                      ciRef: deployment.ref,
                      environment: query.data?.name,
                      onResult: (job) =>
                        router.push(`/projects/${projectId}/jobs/${job.id}`),
                    },
                  );
                })
              }
            />
            <Button
              title="Rollback qua pipeline đã cấu hình"
              disabled={
                disabled || !policy?.rollback || !supportsInputs(app.version)
              }
              onPress={() =>
                void mutation.run(async () => {
                  const rollback = policy?.rollback;
                  if (
                    !rollback ||
                    !policy.inputsEnabled ||
                    rollback.environment !== query.data?.name
                  )
                    throw new PolicyError(
                      "Chưa có workflow rollback đã kiểm thử cho environment.",
                    );
                  requireCiPolicy(
                    app.preferences.policies,
                    app.account!.instance,
                    projectId,
                    rollback.ref,
                    rollback.environment,
                  );
                  await mutation.execute(
                    "Rollback theo policy CI",
                    `Environment ${rollback.environment}\nTarget SHA ${deployment.sha}\nWorkflow ref ${rollback.ref}\nKhông bảo đảm rollback database.`,
                    {
                      action: "deployment-rollback",
                      targetId: deployment.id,
                      ref: rollback.ref,
                      sha: deployment.sha,
                    },
                    async () =>
                      pipelineSchema.parse(
                        await api.write(path + "/pipeline", "POST", {
                          ref: rollback.ref,
                          inputs: { [rollback.inputKey]: deployment.sha },
                        }),
                      ),
                    {
                      ciRef: rollback.ref,
                      environment: rollback.environment,
                      onResult: (pipeline) =>
                        router.push(
                          `/projects/${projectId}/pipelines/${pipeline.id}`,
                        ),
                    },
                  );
                })
              }
            />
          </Card>
        ))}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {deployments.data?.next && (
        <Button
          title="Trang tiếp"
          onPress={() => setPage(deployments.data!.next!)}
        />
      )}
      {[query.error, deployments.error, mutation.error]
        .filter(Boolean)
        .map((error, index) => (
          <ErrorNotice
            key={index}
            error={error}
            retry={() => void query.refetch()}
          />
        ))}
    </Body>
  );
}
export function ScheduleDetail({
  projectId,
  id,
}: {
  projectId: number;
  id: number;
}) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const path = `${projectPath(projectId)}/pipeline_schedules/${id}`;
  const query = useResource(["schedule", projectId, id], async (signal) =>
    scheduleSchema.parse(await api.detail(projectId, "schedules", id, signal)),
  );
  const [page, setPage] = useState(1);
  const history = useResource(
    ["schedule-history", projectId, id, page],
    (signal) => api.list(path + "/pipelines", pipelineSchema, { page }, signal),
  );
  const schedule = query.data;
  const [edit, setEdit] = useState(false);
  const [description, setDescription] = useState("");
  const [cron, setCron] = useState("");
  const [timezone, setTimezone] = useState("");
  const [ref, setRef] = useState<RefChoice | null>(null);
  const [inputs, setInputs] = useState("{}");
  const disabled = mutation.busy || !!app.pendingIntent || !schedule;
  const run = (command: "play" | "take_ownership" | "toggle" | "delete") =>
    void mutation.run(async () => {
      if (!schedule) return;
      const refName = schedule.ref.replace(/^refs\/(heads|tags)\//, "");
      await mutation.execute(
        `${command} schedule`,
        `${schedule.description}\n${schedule.ref}\n${schedule.cron} · ${schedule.cron_timezone}`,
        { action: `schedule-${command}`, targetId: id, ref: refName },
        async () => {
          const latest = scheduleSchema.parse(
            await api.detail(projectId, "schedules", id),
          );
          if (
            latest.ref !== schedule.ref ||
            latest.cron !== schedule.cron ||
            latest.active !== schedule.active ||
            latest.owner?.id !== schedule.owner?.id
          )
            throw new PolicyError("Schedule/owner đã đổi. Tải lại trước.");
          return api.write(
            command === "play" || command === "take_ownership"
              ? path + "/" + command
              : path,
            command === "delete"
              ? "DELETE"
              : command === "toggle"
                ? "PUT"
                : "POST",
            command === "toggle" ? { active: !schedule.active } : undefined,
          );
        },
        {
          ciRef: refName,
          destructive: command === "delete",
          onResult: () => {
            if (command === "delete")
              router.replace(`/projects/${projectId}/schedules`);
          },
        },
      );
    });
  return (
    <Body>
      <Heading>{schedule?.description || `Schedule #${id}`}</Heading>
      {schedule && <Status value={schedule.active ? "Đang bật" : "Đã tắt"} />}
      <Copy>{schedule?.ref}</Copy>
      <Copy>
        {schedule?.cron} · {schedule?.cron_timezone}
      </Copy>
      <Caption>
        Owner: {schedule?.owner?.username || "unknown"} · active:{" "}
        {String(schedule?.active)} · next run: {schedule?.next_run_at || "—"}
      </Caption>
      <Button
        title="Run now (không đổi next run)"
        variant="primary"
        disabled={disabled}
        onPress={() => run("play")}
      />
      <Button
        title={schedule?.active ? "Tắt schedule" : "Bật schedule"}
        disabled={disabled}
        onPress={() => run("toggle")}
      />
      <Button
        title="Take ownership"
        disabled={disabled}
        onPress={() => run("take_ownership")}
      />
      <Button
        title="Xóa schedule"
        danger
        disabled={disabled}
        onPress={() => run("delete")}
      />
      <Button
        title="Sửa schedule"
        disabled={disabled}
        onPress={() => {
          if (!schedule) return;
          setDescription(schedule.description);
          setCron(schedule.cron);
          setTimezone(schedule.cron_timezone);
          setEdit(!edit);
        }}
      />
      {edit && (
        <Card>
          <Field label="Mô tả" value={description} onChange={setDescription} />
          <Field label="Cron" value={cron} onChange={setCron} />
          <Field
            label="Timezone IANA"
            value={timezone}
            onChange={setTimezone}
          />
          <RefPicker projectId={projectId} value={ref} onChange={setRef} />
          {supportsInputs(app.version) && (
            <Field
              label="Inputs JSON object (không lưu giá trị)"
              value={inputs}
              onChange={setInputs}
              multiline
            />
          )}
          <Button
            title="Lưu schedule"
            disabled={disabled || !ref}
            onPress={() =>
              void mutation.run(async () => {
                if (!schedule || !ref) return;
                validateSchedule(cron, timezone);
                const parsed = inputSchema.parse(JSON.parse(inputs));
                const policy = requireCiPolicy(
                  app.preferences.policies,
                  app.account!.instance,
                  projectId,
                  ref.name,
                );
                if (
                  Object.keys(parsed).length &&
                  (!supportsInputs(app.version) || !policy.inputsEnabled)
                )
                  throw new PolicyError(
                    "Inputs chưa hỗ trợ/được policy cho phép.",
                  );
                await mutation.execute(
                  "Sửa schedule",
                  `${description}\n${ref.kind}: ${ref.name}\n${cron} · ${timezone}`,
                  { action: "schedule-update", targetId: id, ref: ref.name },
                  async () => {
                    const latest = scheduleSchema.parse(
                      await api.detail(projectId, "schedules", id),
                    );
                    if (
                      latest.cron !== schedule.cron ||
                      latest.ref !== schedule.ref ||
                      latest.owner?.id !== schedule.owner?.id
                    )
                      throw new PolicyError(
                        "Schedule đã thay đổi. Tải lại trước.",
                      );
                    return api.write(path, "PUT", {
                      description,
                      cron,
                      cron_timezone: timezone,
                      ref: `refs/${ref.kind === "branch" ? "heads" : "tags"}/${ref.name}`,
                      ...(Object.keys(parsed).length
                        ? {
                            inputs: Object.entries(parsed).map(
                              ([name, value]) => ({ name, value }),
                            ),
                          }
                        : {}),
                    });
                  },
                  { ciRef: ref.name },
                );
                setEdit(false);
              })
            }
          />
        </Card>
      )}
      <SectionHeading title="Lịch sử chạy" />
      {history.data?.items.map((pipeline) => (
        <Button
          key={pipeline.id}
          title={`#${pipeline.id} ${pipeline.status} ${pipeline.ref}`}
          onPress={() =>
            router.push(`/projects/${projectId}/pipelines/${pipeline.id}`)
          }
        />
      ))}
      {page > 1 && (
        <Button title="History trang trước" onPress={() => setPage(page - 1)} />
      )}
      {history.data?.next && (
        <Button
          title="History trang tiếp"
          onPress={() => setPage(history.data!.next!)}
        />
      )}
      {[query.error, history.error, mutation.error]
        .filter(Boolean)
        .map((error, index) => (
          <ErrorNotice
            key={index}
            error={error}
            retry={() => void query.refetch()}
          />
        ))}
    </Body>
  );
}
