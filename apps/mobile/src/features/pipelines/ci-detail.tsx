import React, { useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { router } from "expo-router";
import { z } from "zod";
import { api, fetcher, useApp } from "../../core/query/provider";
import { projectPath } from "../../core/gitlab/client";
import { pipelineSchema, jobSchema } from "../../core/gitlab/types";
import { terminal } from "../../core/gitlab/capabilities";
import {
  requireCiPolicy,
  requireManualJob,
  PolicyError,
} from "../../core/security/action-policy";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Card,
  Button,
  Field,
  ErrorNotice,
  useResource,
  useColors,
  confirm,
  openExternal,
  Status,
  SectionHeading,
  ListRow,
} from "../../components/ui";
import { Workflow } from "lucide-react-native";
import { useGitLabMutation } from "../mutation-action";
import { bridgeSchema } from "../gitlab-api";
import {
  downloadArtifact,
  shareArtifact,
  readTrace,
  transfersVerified,
} from "../jobs/transfers";

const reportSchema = z
  .object({
    total: z
      .object({
        count: z.number().optional(),
        success: z.number().optional(),
        failed: z.number().optional(),
        skipped: z.number().optional(),
        error: z.number().optional(),
      })
      .optional(),
    test_suites: z.array(z.unknown()).optional(),
  })
  .passthrough();
export function PipelineDetail({
  projectId,
  id,
}: {
  projectId: number;
  id: number;
}) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const path = `${projectPath(projectId)}/pipelines/${id}`;
  const query = useResource(
    ["pipeline", projectId, id],
    async (signal) =>
      pipelineSchema.parse(
        await api.detail(projectId, "pipelines", id, signal),
      ),
    (data) => (data && !terminal(data.status) ? 8000 : false),
  );
  const [jobPage, setJobPage] = useState(1);
  const [bridgePage, setBridgePage] = useState(1);
  const [includeRetried, setRetried] = useState(false);
  const jobs = useResource(
    ["pipeline-jobs", projectId, id, jobPage, includeRetried],
    (signal) =>
      api.list(
        path + "/jobs",
        jobSchema,
        { page: jobPage, include_retried: includeRetried },
        signal,
      ),
    () => (query.data && !terminal(query.data.status) ? 8000 : false),
  );
  const bridges = useResource(
    ["bridges", projectId, id, bridgePage],
    (signal) =>
      api.list(path + "/bridges", bridgeSchema, { page: bridgePage }, signal),
  );
  const report = useResource(["test-report", projectId, id], async (signal) =>
    reportSchema.parse(
      await api.client.json(path + "/test_report_summary", { signal }),
    ),
  );
  const [reportPage, setReportPage] = useState(1);
  const [showReport, setShowReport] = useState(false);
  const detailedReport = useResource(
    ["test-report-detail", projectId, id, reportPage, showReport],
    async (signal) =>
      showReport
        ? api.client.json<{ test_suites?: unknown[] }>(path + "/test_report", {
            params: { page: reportPage, per_page: 10 },
            signal,
          })
        : null,
  );
  const pipeline = query.data;
  const ci = (command: "retry" | "cancel") =>
    void mutation.run(async () => {
      if (!pipeline) return;
      await mutation.execute(
        command === "retry" ? "Retry failed/canceled jobs" : "Cancel pipeline",
        `Pipeline #${id}\n${pipeline.ref}\nSHA ${pipeline.sha}`,
        {
          action: `pipeline-${command}`,
          targetId: id,
          ref: pipeline.ref,
          sha: pipeline.sha,
        },
        async () => {
          const latest = pipelineSchema.parse(
            await api.detail(projectId, "pipelines", id),
          );
          if (
            latest.sha !== pipeline.sha ||
            (command === "retry" &&
              !["failed", "canceled"].includes(latest.status)) ||
            (command === "cancel" && terminal(latest.status))
          )
            throw new PolicyError(
              "Pipeline đã đổi trạng thái. Tải lại trước khi gửi lệnh.",
            );
          return api.write(path + "/" + command, "POST");
        },
        { ciRef: pipeline.ref, destructive: command === "cancel" },
      );
    });
  return (
    <Body>
      <Heading>Pipeline #{id}</Heading>
      {pipeline && <Status value={pipeline.status} />}
      <Copy>{pipeline?.ref}</Copy>
      <Caption>SHA {pipeline?.sha}</Caption>
      <Caption>
        Source {pipeline?.source || "—"} · Duration {pipeline?.duration ?? "—"}s
      </Caption>
      {pipeline && (
        <>
          <Button
            title="Retry failed/canceled jobs"
            variant="primary"
            disabled={
              mutation.busy ||
              !["failed", "canceled"].includes(pipeline.status) ||
              !!app.pendingIntent
            }
            onPress={() => ci("retry")}
          />
          <Button
            title="Cancel pipeline"
            danger
            disabled={
              mutation.busy || terminal(pipeline.status) || !!app.pendingIntent
            }
            onPress={() => ci("cancel")}
          />
        </>
      )}
      <SectionHeading title="Stages và jobs" />
      <Button
        title={includeRetried ? "Ẩn jobs đã retry" : "Hiện jobs đã retry"}
        onPress={() => {
          setRetried(!includeRetried);
          setJobPage(1);
        }}
      />
      {jobs.data?.items.map((job) => (
        <ListRow
          key={job.id}
          icon={Workflow}
          title={job.name}
          subtitle={`${job.stage} · #${job.id}${job.allow_failure ? " · allow_failure" : ""}`}
          status={job.status}
          onPress={() => router.push(`/projects/${projectId}/jobs/${job.id}`)}
        />
      ))}
      {jobPage > 1 && (
        <Button
          title="Jobs trang trước"
          onPress={() => setJobPage(jobPage - 1)}
        />
      )}
      {jobs.data?.next && (
        <Button
          title="Jobs trang tiếp"
          onPress={() => setJobPage(jobs.data!.next!)}
        />
      )}
      <SectionHeading title="Downstream" />
      {bridges.data?.items.map((bridge) => (
        <Card key={bridge.id}>
          <Copy>
            {bridge.name} · {bridge.status}
          </Copy>
          {bridge.downstream_pipeline ? (
            <Button
              title={`Project #${bridge.downstream_pipeline.project_id} · pipeline #${bridge.downstream_pipeline.id}`}
              onPress={() =>
                router.push(
                  `/projects/${bridge.downstream_pipeline!.project_id}/pipelines/${bridge.downstream_pipeline!.id}`,
                )
              }
            />
          ) : (
            <Caption>Chưa có downstream hoặc không có quyền đọc.</Caption>
          )}
        </Card>
      ))}
      {bridgePage > 1 && (
        <Button
          title="Bridges trang trước"
          onPress={() => setBridgePage(bridgePage - 1)}
        />
      )}
      {bridges.data?.next && (
        <Button
          title="Bridges trang tiếp"
          onPress={() => setBridgePage(bridges.data!.next!)}
        />
      )}
      <SectionHeading title="JUnit reports" />
      <Copy>
        {report.data?.total
          ? JSON.stringify(report.data.total, null, 2)
          : "Chưa có report. Điều này không chứng minh tests pass."}
      </Copy>
      <Button
        title={showReport ? "Ẩn test details" : "Xem test details"}
        onPress={() => setShowReport(!showReport)}
      />
      {showReport && (
        <>
          <Copy mono>{JSON.stringify(detailedReport.data, null, 2)}</Copy>
          <Button
            title="Trang tests trước"
            disabled={reportPage === 1}
            onPress={() => setReportPage(reportPage - 1)}
          />
          <Button
            title="Trang tests tiếp"
            onPress={() => setReportPage(reportPage + 1)}
          />
        </>
      )}
      {[
        query.error,
        jobs.error,
        bridges.error,
        report.error,
        detailedReport.error,
        mutation.error,
      ]
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
export function JobDetail({
  projectId,
  id,
}: {
  projectId: number;
  id: number;
}) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const c = useColors();
  const [search, setSearch] = useState("");
  const [viewTrace, setViewTrace] = useState(false);
  const [bytes, setBytes] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const downloadController = useRef<AbortController | null>(null);
  const list = useRef<FlatList<string>>(null);
  const jobQuery = useResource(
    ["job", projectId, id],
    async (signal) =>
      jobSchema.parse(await api.detail(projectId, "jobs", id, signal)),
    (data) =>
      data && !terminal(data.status) && data.status !== "manual" ? 8000 : false,
  );
  const job = jobQuery.data;
  const trace = useResource(
    ["trace", projectId, id, viewTrace],
    (signal) =>
      viewTrace
        ? readTrace(api.client, projectId, id, signal)
        : Promise.resolve(""),
    () => (viewTrace && job && !terminal(job.status) ? 8000 : false),
  );
  useEffect(
    () => () => {
      downloadController.current?.abort();
    },
    [],
  );
  const command = (command: "retry" | "cancel" | "play") =>
    void mutation.run(async () => {
      if (!job) return;
      const policy = requireCiPolicy(
        app.preferences.policies,
        app.account!.instance,
        projectId,
        job.ref,
        job.environment?.name,
      );
      if (command === "play") requireManualJob(job, policy);
      await mutation.execute(
        `${command} job`,
        `${job.name} #${id}\n${job.ref}\nSHA ${job.commit?.id || job.pipeline?.sha || "unknown"}\nEnvironment: ${job.environment?.name || "không có metadata"}`,
        {
          action: `job-${command}`,
          targetId: id,
          ref: job.ref,
          sha: job.commit?.id || job.pipeline?.sha,
        },
        async () => {
          const latest = jobSchema.parse(
            await api.detail(projectId, "jobs", id),
          );
          if (
            latest.status !== job.status ||
            latest.ref !== job.ref ||
            latest.archived ||
            latest.commit?.id !== job.commit?.id
          )
            throw new PolicyError(
              "Job đã đổi hoặc archived. Tải lại trước khi thao tác.",
            );
          if (command === "play") requireManualJob(latest, policy);
          if (
            command === "retry" &&
            !["failed", "canceled"].includes(latest.status)
          )
            throw new PolicyError(
              "Chỉ retry job failed/canceled; redeploy dùng policy riêng.",
            );
          if (command === "cancel" && terminal(latest.status))
            throw new PolicyError("Job đã kết thúc.");
          return jobSchema.parse(
            await api.write(
              `${projectPath(projectId)}/jobs/${id}/${command}`,
              "POST",
            ),
          );
        },
        {
          ciRef: job.ref,
          environment: job.environment?.name,
          destructive: command === "cancel",
          onResult: (next) => {
            if (next.id !== id)
              router.replace(`/projects/${projectId}/jobs/${next.id}`);
          },
        },
      );
    });
  const download = () =>
    void mutation.run(async () => {
      if (!job?.artifacts_file?.filename)
        throw new PolicyError("Job không có artifact archive.");
      if (
        !(await confirm(
          "Tải artifact ZIP",
          `${job.name} #${id}\nTối đa 128 MiB. Không tự mở hoặc giải nén.`,
        ))
      )
        return;
      mutation.assertAccount();
      setDownloading(true);
      setBytes(0);
      const controller = new AbortController();
      downloadController.current = controller;
      try {
        const file = await downloadArtifact(
          api.client,
          fetcher,
          projectId,
          id,
          controller.signal,
          setBytes,
        );
        mutation.assertAccount();
        if (
          await confirm(
            "Chia sẻ artifact",
            "File có thể chứa dữ liệu private. Chọn ứng dụng đích mà bạn tin cậy.",
          )
        )
          await shareArtifact(file);
        else if (file.exists) file.delete();
      } finally {
        setDownloading(false);
        downloadController.current = null;
      }
    });
  const lines = (trace.data || "")
    .split("\n")
    .filter(
      (line) => !search || line.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        ref={list}
        data={viewTrace ? lines : []}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Text
            selectable
            style={{
              color: c.text,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {item}
          </Text>
        )}
        ListHeaderComponent={
          <>
            <Heading>{job?.name || `Job #${id}`}</Heading>
            {job && <Status value={job.status} />}
            <Copy>{job?.stage}</Copy>
            <Caption>
              {job?.ref} · SHA {job?.commit?.id || "—"}
            </Caption>
            <Copy>{job?.failure_reason}</Copy>
            <Caption>
              Runner: {job?.runner?.description || "—"} · Environment:{" "}
              {job?.environment?.name || "chưa xác định"}
            </Caption>
            {(["retry", "cancel", "play"] as const).map((cmd) => (
              <Button
                key={cmd}
                title={`${cmd} job`}
                variant={cmd === "cancel" ? "outline" : "primary"}
                danger={cmd === "cancel"}
                disabled={
                  mutation.busy ||
                  !!app.pendingIntent ||
                  !job ||
                  (cmd === "play"
                    ? job.status !== "manual" || job.archived === true
                    : cmd === "retry"
                      ? !["failed", "canceled"].includes(job.status) ||
                        job.archived === true
                      : terminal(job.status))
                }
                onPress={() => command(cmd)}
              />
            ))}
            <Caption>
              Artifact: {job?.artifacts_file?.filename || "—"} ·{" "}
              {job?.artifacts_file?.size ?? 0} bytes · hết hạn{" "}
              {job?.artifacts_expire_at || "chưa có"}
            </Caption>
            <Button
              title={
                downloading
                  ? `Đang tải: ${bytes} bytes`
                  : "Tải và chia sẻ artifact"
              }
              disabled={
                mutation.busy ||
                !transfersVerified() ||
                !job?.artifacts_file?.filename
              }
              onPress={download}
            />
            {downloading && (
              <Button
                title="Hủy tải"
                onPress={() => downloadController.current?.abort()}
              />
            )}
            {!transfersVerified() && (
              <Caption>
                Log/artifact khóa đến khi streaming và redirect được kiểm chứng
                trên native build. Xem hướng dẫn development.
              </Caption>
            )}
            <Button
              title={viewTrace ? "Ẩn log" : "Xem log (giới hạn 1 MiB)"}
              disabled={!transfersVerified()}
              onPress={() => setViewTrace(!viewTrace)}
            />
            {viewTrace && (
              <>
                <Field
                  label="Tìm trong log"
                  value={search}
                  onChange={setSearch}
                />
                <Button
                  title="Cuối log"
                  onPress={() => list.current?.scrollToEnd()}
                />
                <Caption>
                  Nhấn giữ để copy đoạn bạn chọn. Poll dừng khi screen inactive
                  hoặc job kết thúc.
                </Caption>
              </>
            )}
            {typeof job?.web_url === "string" && (
              <Button
                title="Mở job trên GitLab"
                onPress={() =>
                  void mutation.run(() => openExternal(job.web_url as string))
                }
              />
            )}
            {[jobQuery.error, trace.error, mutation.error]
              .filter(Boolean)
              .map((error, index) => (
                <ErrorNotice
                  key={index}
                  error={error}
                  retry={() => void jobQuery.refetch()}
                />
              ))}
          </>
        }
      />
    </View>
  );
}
