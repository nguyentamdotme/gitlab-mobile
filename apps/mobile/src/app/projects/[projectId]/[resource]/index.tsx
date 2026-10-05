import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  CircleDot,
  GitPullRequest,
  Workflow,
  Server,
  CalendarClock,
  Package,
  Play,
  Plus,
  Search,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { api } from "../../../../core/query/provider";
import {
  resourceSchema,
  Resource,
  resourceEndpoint,
} from "../../../../features/gitlab-api";
import {
  PagedList,
  Button,
  ListRow,
  Field,
  ChoiceChips,
  Copy,
} from "../../../../components/ui";
import { projectPath } from "../../../../core/gitlab/client";

const names: Record<Resource, string> = {
  issues: "Issues",
  "merge-requests": "Merge Requests",
  pipelines: "Pipelines",
  jobs: "Jobs",
  environments: "Environments",
  schedules: "Schedules",
  deployments: "Deployments",
};
const icons: Record<Resource, LucideIcon> = {
  issues: CircleDot,
  "merge-requests": GitPullRequest,
  pipelines: Workflow,
  jobs: Play,
  environments: Server,
  schedules: CalendarClock,
  deployments: Package,
};
export default function ResourceList() {
  const params = useLocalSearchParams<{
    projectId: string;
    resource: Resource;
  }>();
  const projectId = Number(params.projectId);
  const resource = params.resource;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  if (!(resource in resourceSchema)) return <Copy>Resource không hỗ trợ.</Copy>;
  const canSearch = ["issues", "merge-requests", "pipelines"].includes(
    resource,
  );
  const canCreate = [
    "issues",
    "merge-requests",
    "pipelines",
    "schedules",
  ].includes(resource);
  const statuses =
    resource === "pipelines"
      ? [
          { value: "", label: "Tất cả" },
          { value: "failed", label: "Thất bại" },
          { value: "running", label: "Đang chạy" },
          { value: "success", label: "Thành công" },
          { value: "manual", label: "Thủ công" },
        ]
      : [
          { value: "", label: "Đang mở" },
          { value: "closed", label: "Đã đóng" },
        ];
  return (
    <PagedList<Record<string, unknown>>
      title={names[resource]}
      queryKey={[projectId, resource, filter, status]}
      load={(page, signal) =>
        api.list(
          `${projectPath(projectId)}/${resourceEndpoint(resource)}`,
          resourceSchema[resource],
          {
            page,
            ...(resource === "pipelines"
              ? { ref: filter || undefined, status: status || undefined }
              : ["issues", "merge-requests"].includes(resource)
                ? { search: filter, state: status || "opened" }
                : {}),
          },
          signal,
        )
      }
      header={
        <>
          {canSearch && (
            <>
              <Field
                label={
                  resource === "pipelines"
                    ? "Tìm theo branch hoặc tag"
                    : "Tìm kiếm"
                }
                value={search}
                onChange={setSearch}
                placeholder={resource === "pipelines" ? "main" : "Tiêu đề"}
              />
              <Button
                title="Tìm kiếm"
                icon={Search}
                onPress={() => setFilter(search.trim())}
              />
              <ChoiceChips
                options={statuses}
                value={status}
                onChange={setStatus}
              />
            </>
          )}
          {canCreate && (
            <Button
              title={resource === "pipelines" ? "Chạy pipeline" : "Tạo mới"}
              variant="primary"
              icon={resource === "pipelines" ? Play : Plus}
              onPress={() =>
                router.push(`/projects/${projectId}/${resource}/new`)
              }
            />
          )}
        </>
      }
      renderItem={(item) => {
        const id = Number(item.iid || item.id);
        const title =
          resource === "pipelines"
            ? `Pipeline #${id} · ${String(item.ref || "")}`
            : resource === "jobs"
              ? String(item.name || `Job #${id}`)
              : resource === "issues" || resource === "merge-requests"
                ? String(item.title || `#${id}`)
                : resource === "schedules"
                  ? String(item.description || `Schedule #${id}`)
                  : String(item.name || `#${id}`);
        const subtitle =
          resource === "issues"
            ? `Issue #${id}`
            : resource === "merge-requests"
              ? `MR !${id}`
              : resource === "schedules"
                ? `${String(item.ref || "")} · ${String(item.cron || "")}`
                : resource === "pipelines"
                  ? String(item.sha || "").slice(0, 8)
                  : String(item.ref || "");
        const state =
          resource === "pipelines" ||
          resource === "jobs" ||
          resource === "deployments"
            ? String(item.status || "")
            : resource === "issues" ||
                resource === "merge-requests" ||
                resource === "environments"
              ? String(item.state || "")
              : "";
        return (
          <ListRow
            title={title}
            subtitle={subtitle}
            status={state}
            icon={icons[resource]}
            onPress={() =>
              router.push(`/projects/${projectId}/${resource}/${id}`)
            }
          />
        );
      }}
    />
  );
}
