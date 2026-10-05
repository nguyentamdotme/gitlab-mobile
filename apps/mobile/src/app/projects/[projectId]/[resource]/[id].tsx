import React from "react";
import { useLocalSearchParams } from "expo-router";
import { Body, Copy } from "../../../../components/ui";
import { IssueDetail } from "../../../../features/issues/issue-detail";
import {
  PipelineDetail,
  JobDetail,
} from "../../../../features/pipelines/ci-detail";
import { MrDetail } from "../../../../features/merge-requests/mr-detail";
import {
  EnvironmentDetail,
  ScheduleDetail,
  DeploymentDetail,
} from "../../../../features/environments/advanced-detail";
import type { Resource } from "../../../../features/gitlab-api";
export default function Detail() {
  const params = useLocalSearchParams<{
    projectId: string;
    resource: Resource;
    id: string;
  }>();
  const props = { projectId: Number(params.projectId), id: Number(params.id) };
  if (
    !Number.isSafeInteger(props.projectId) ||
    !Number.isSafeInteger(props.id) ||
    props.projectId < 1 ||
    props.id < 1
  )
    return (
      <Body>
        <Copy>ID không hợp lệ.</Copy>
      </Body>
    );
  switch (params.resource) {
    case "issues":
      return <IssueDetail {...props} />;
    case "pipelines":
      return <PipelineDetail {...props} />;
    case "jobs":
      return <JobDetail {...props} />;
    case "merge-requests":
      return <MrDetail {...props} />;
    case "environments":
      return <EnvironmentDetail {...props} />;
    case "deployments":
      return <DeploymentDetail {...props} />;
    case "schedules":
      return <ScheduleDetail {...props} />;
    default:
      return (
        <Body>
          <Copy>Resource không hỗ trợ.</Copy>
        </Body>
      );
  }
}
