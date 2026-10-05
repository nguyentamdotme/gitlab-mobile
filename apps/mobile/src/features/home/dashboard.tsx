import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import {
  CircleX,
  GitPullRequest,
  FolderGit2,
  Workflow,
  CircleDot,
  Play,
} from "lucide-react-native";
import { useApp, api } from "../../core/query/provider";
import {
  Body,
  Button,
  Caption,
  ErrorNotice,
  Heading,
  ListRow,
  MetricTile,
  SectionHeading,
  useColors,
  useResource,
} from "../../components/ui";
import { pipelineSchema, mrSchema, issueSchema } from "../../core/gitlab/types";
import type { Pipeline, MergeRequest, Issue } from "../../core/gitlab/types";
import { projectPath } from "../../core/gitlab/client";

type PinnedSummary = {
  id: number;
  name: string;
  path: string;
  pipelines: Pipeline[];
  morePipelines: boolean;
  errors: unknown[];
};

const projectIdOf = (item: MergeRequest | Issue) => {
  const projectId = Number(item.project_id);
  return Number.isSafeInteger(projectId) && projectId > 0 ? projectId : null;
};

export default function Dashboard({ ci = false }: { ci?: boolean }) {
  const app = useApp();
  const c = useColors();
  const pins = app.preferences.pins;
  const projectData = useResource(
    ["dashboard", "pinned", pins],
    async (signal) => {
      const result: PinnedSummary[] = [];
      for (let start = 0; start < pins.length; start += 3) {
        const batch = await Promise.all(
          pins.slice(start, start + 3).map(async (id) => {
            const [project, pipelines] = await Promise.allSettled([
              api.project(id, signal),
              api.list(
                `${projectPath(id)}/pipelines`,
                pipelineSchema,
                { per_page: 5 },
                signal,
              ),
            ]);
            return {
              id,
              name:
                project.status === "fulfilled"
                  ? project.value.name
                  : `Project #${id}`,
              path:
                project.status === "fulfilled"
                  ? project.value.path_with_namespace
                  : `Project #${id}`,
              pipelines:
                pipelines.status === "fulfilled" ? pipelines.value.items : [],
              morePipelines:
                pipelines.status === "fulfilled" && !!pipelines.value.next,
              errors: [project, pipelines]
                .filter((item) => item.status === "rejected")
                .map((item) => (item as PromiseRejectedResult).reason),
            };
          }),
        );
        result.push(...batch);
      }
      return result;
    },
  );
  const assigned = useResource(
    ["dashboard", "assigned", ci],
    async (signal) => {
      if (ci)
        return {
          mrs: [] as MergeRequest[],
          issues: [] as Issue[],
          moreMrs: false,
          moreIssues: false,
          errors: [] as unknown[],
        };
      const [mrs, issues] = await Promise.allSettled([
        api.list(
          "/merge_requests",
          mrSchema,
          {
            reviewer_id: app.account!.userId,
            state: "opened",
            scope: "all",
            per_page: 10,
          },
          signal,
        ),
        api.list(
          "/issues",
          issueSchema,
          {
            assignee_id: app.account!.userId,
            state: "opened",
            scope: "all",
            per_page: 10,
          },
          signal,
        ),
      ]);
      return {
        mrs: mrs.status === "fulfilled" ? mrs.value.items : [],
        issues: issues.status === "fulfilled" ? issues.value.items : [],
        moreMrs: mrs.status === "fulfilled" && !!mrs.value.next,
        moreIssues: issues.status === "fulfilled" && !!issues.value.next,
        errors: [mrs, issues]
          .filter((item) => item.status === "rejected")
          .map((item) => (item as PromiseRejectedResult).reason),
      };
    },
  );
  const projects = projectData.data || [];
  const recent = projects
    .flatMap((project) =>
      project.pipelines.map((pipeline) => ({ project, pipeline })),
    )
    .sort((a, b) =>
      (b.pipeline.created_at || "").localeCompare(a.pipeline.created_at || ""),
    );
  const failures = recent.filter(
    ({ pipeline }) => pipeline.status === "failed",
  );
  const running = recent.filter(({ pipeline }) =>
    ["running", "pending", "manual", "blocked"].includes(pipeline.status),
  );
  const needsReconnect = [
    "reconnect-required",
    "refresh-outcome-unknown",
  ].includes(app.state);
  const projectAction = (id: number) => router.push(`/projects/${id}`);
  const pipelineAction = (id: number, pipelineId: number) =>
    router.push(`/projects/${id}/pipelines/${pipelineId}`);
  const seeAll = (title: string, onPress: () => void) => (
    <Button title={title} variant="ghost" onPress={onPress} />
  );
  const pipelineRow = ({ project, pipeline }: (typeof recent)[number]) => (
    <ListRow
      key={`${project.id}:${pipeline.id}`}
      title={`Pipeline #${pipeline.id} · ${pipeline.ref}`}
      subtitle={project.name}
      icon={Workflow}
      status={pipeline.status}
      onPress={() => pipelineAction(project.id, pipeline.id)}
    />
  );

  return (
    <Body>
      <Heading>
        {ci ? "CI/CD" : `Chào ${app.account?.username || "bạn"},`}
      </Heading>
      <Caption>
        {ci
          ? "Theo dõi pipeline ở các project đã ghim"
          : `Workspace của bạn · ${app.account?.instance}`}
      </Caption>
      {projectData.dataUpdatedAt > 0 && (
        <Caption>
          Cập nhật pipeline{" "}
          {new Date(projectData.dataUpdatedAt).toLocaleTimeString()}
        </Caption>
      )}
      {!app.online && (
        <View
          style={{
            backgroundColor: c.warningSoft,
            borderRadius: 12,
            padding: 14,
            marginTop: 14,
          }}
        >
          <Text style={{ color: c.warning }}>
            Đang offline · Dữ liệu chỉ giữ trong phiên hiện tại.
          </Text>
        </View>
      )}
      {needsReconnect && (
        <Button
          title="Kết nối lại GitLab"
          variant="primary"
          onPress={() => router.push("/connect")}
        />
      )}
      {app.pendingIntent && (
        <View
          style={{
            backgroundColor: c.warningSoft,
            borderRadius: 12,
            padding: 14,
            marginTop: 14,
          }}
        >
          <Text style={{ color: c.warning, lineHeight: 21 }}>
            Thao tác {app.pendingIntent.action} ở project #
            {app.pendingIntent.projectId} chưa rõ kết quả. Kiểm tra trước khi
            thử lại.
          </Text>
          <Button
            title="Kiểm tra project"
            onPress={() => projectAction(app.pendingIntent!.projectId)}
          />
        </View>
      )}
      {projectData.isLoading && (
        <Caption>Đang tải project và pipeline…</Caption>
      )}
      {assigned.isLoading && !ci && (
        <Caption>Đang tải MR và issue của bạn…</Caption>
      )}
      {projectData.error && (
        <ErrorNotice
          error={projectData.error}
          retry={() => void projectData.refetch()}
        />
      )}
      {assigned.error && !ci && (
        <ErrorNotice
          error={assigned.error}
          retry={() => void assigned.refetch()}
        />
      )}
      {!ci &&
        assigned.data?.errors.map((error, index) => (
          <ErrorNotice
            key={`assigned:${index}`}
            error={error}
            retry={() => void assigned.refetch()}
          />
        ))}
      {projects
        .flatMap((project) => project.errors)
        .map((error, index) => (
          <ErrorNotice
            key={index}
            error={error}
            retry={() => void projectData.refetch()}
          />
        ))}
      {pins.length === 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.muted, lineHeight: 21 }}>
            Ghim project để theo dõi pipeline trên Home và CI/CD.
          </Text>
          <Button
            title="Chọn project"
            variant="primary"
            onPress={() => router.push("/projects")}
          />
        </View>
      )}
      {!ci && (
        <>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <MetricTile
              value={projectData.data ? failures.length : "…"}
              label="Pipeline lỗi gần đây"
              icon={CircleX}
              onPress={() => router.push("/ci")}
            />
            <MetricTile
              value={
                assigned.data && assigned.data.errors.length === 0
                  ? assigned.data.mrs.length
                  : "…"
              }
              label="MR cần review"
              icon={GitPullRequest}
              onPress={() => router.push("/inbox")}
            />
          </View>
          <SectionHeading
            title="Cần bạn xử lý"
            action={seeAll("Xem tất cả", () => router.push("/inbox"))}
          />
          {failures.slice(0, 3).map(pipelineRow)}
          {assigned.data?.mrs.slice(0, 3).map((mr) => {
            const id = projectIdOf(mr);
            return id ? (
              <ListRow
                key={`mr:${mr.id}`}
                title={mr.title}
                subtitle={`MR !${mr.iid} · Cần bạn review`}
                icon={GitPullRequest}
                onPress={() =>
                  router.push(`/projects/${id}/merge-requests/${mr.iid}`)
                }
              />
            ) : null;
          })}
          {projectData.data &&
            assigned.data &&
            projects.every((project) => project.errors.length === 0) &&
            assigned.data.errors.length === 0 &&
            failures.length === 0 &&
            !assigned.data?.mrs.length && (
              <Caption>
                Không có pipeline lỗi hoặc MR cần review trong dữ liệu đã tải.
              </Caption>
            )}
          <SectionHeading
            title="Project đã ghim"
            action={seeAll("Xem tất cả", () => router.push("/projects"))}
          />
          {projects.map((project) => (
            <ListRow
              key={project.id}
              title={project.name}
              subtitle={project.path}
              icon={FolderGit2}
              onPress={() => projectAction(project.id)}
            />
          ))}
          {assigned.data?.issues.length ? (
            <>
              <SectionHeading
                title="Issue của tôi"
                action={seeAll("Xem tất cả", () => router.push("/inbox"))}
              />
              {assigned.data.issues.slice(0, 2).map((issue) => {
                const id = projectIdOf(issue);
                return id ? (
                  <ListRow
                    key={`issue:${issue.id}`}
                    title={issue.title}
                    subtitle={`Issue #${issue.iid}`}
                    icon={CircleDot}
                    onPress={() =>
                      router.push(`/projects/${id}/issues/${issue.iid}`)
                    }
                  />
                ) : null;
              })}
            </>
          ) : null}
        </>
      )}
      {ci && (
        <>
          <SectionHeading title="Pipeline cần theo dõi" />
          {running.slice(0, 5).map(pipelineRow)}
          {failures.slice(0, 5).map(pipelineRow)}
          {!projectData.isLoading && recent.length === 0 && (
            <Caption>Chưa có pipeline trong các project đã ghim.</Caption>
          )}
          <SectionHeading title="Theo project" />
          {projects.map((project) => (
            <ListRow
              key={project.id}
              title={project.name}
              subtitle="Xem danh sách pipeline và chạy mới"
              icon={FolderGit2}
              onPress={() => router.push(`/projects/${project.id}/pipelines`)}
            />
          ))}
          <Button
            title="Chọn project để chạy pipeline"
            icon={Play}
            variant="primary"
            onPress={() => router.push("/projects")}
          />
        </>
      )}
      {projects.some((project) => project.morePipelines) && (
        <Caption>
          Mỗi project hiển thị 5 pipeline gần nhất. Mở project để xem thêm.
        </Caption>
      )}
      {!ci &&
        assigned.data &&
        (assigned.data.moreMrs || assigned.data.moreIssues) && (
          <Caption>
            MR và issue hiển thị trang đầu. Mở Inbox để tải thêm.
          </Caption>
        )}
    </Body>
  );
}
