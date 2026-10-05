import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  FolderCode,
  CircleDot,
  GitPullRequest,
  Workflow,
  Server,
  CalendarClock,
  FileCheck,
  Pin,
  PinOff,
} from "lucide-react-native";
import { api, useApp } from "../../../core/query/provider";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Button,
  Card,
  ListRow,
  SectionHeading,
  useResource,
  useAction,
  ErrorNotice,
} from "../../../components/ui";
export default function Project() {
  const { projectId: input } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(input);
  const app = useApp();
  const action = useAction();
  const query = useResource(["project", projectId], (signal) =>
    api.project(projectId, signal),
  );
  const pin = app.preferences.pins.includes(projectId);
  const togglePin = () =>
    void action.run(() =>
      app.updatePreferences({
        ...app.preferences,
        pins: pin
          ? app.preferences.pins.filter((id) => id !== projectId)
          : [...app.preferences.pins, projectId],
      }),
    );
  return (
    <Body>
      <Heading>{query.data?.name || `Project #${projectId}`}</Heading>
      <Caption>{query.data?.path_with_namespace}</Caption>
      {!!query.data?.description && <Copy>{query.data.description}</Copy>}
      <Card>
        <Caption>Branch mặc định</Caption>
        <Copy>{query.data?.default_branch || "Chưa có"}</Copy>
        <Button
          title={pin ? "Bỏ ghim project" : "Ghim project"}
          icon={pin ? PinOff : Pin}
          disabled={action.busy || (!pin && app.preferences.pins.length >= 8)}
          onPress={togglePin}
        />
        {!pin && app.preferences.pins.length >= 8 && (
          <Caption>Đã ghim tối đa 8 project.</Caption>
        )}
      </Card>
      <SectionHeading title="Trong project" />
      <ListRow
        title="Repository"
        subtitle="Branch, commit và file · chỉ đọc"
        icon={FolderCode}
        onPress={() => router.push(`/projects/${projectId}/repository`)}
      />
      <ListRow
        title="Issues"
        subtitle="Theo dõi và xử lý issue"
        icon={CircleDot}
        onPress={() => router.push(`/projects/${projectId}/issues`)}
      />
      <ListRow
        title="Merge Requests"
        subtitle="Review và thảo luận"
        icon={GitPullRequest}
        onPress={() => router.push(`/projects/${projectId}/merge-requests`)}
      />
      <ListRow
        title="Pipelines"
        subtitle="Theo dõi job và chạy pipeline"
        icon={Workflow}
        onPress={() => router.push(`/projects/${projectId}/pipelines`)}
      />
      <ListRow
        title="Environments"
        subtitle="Deployment và trạng thái môi trường"
        icon={Server}
        onPress={() => router.push(`/projects/${projectId}/environments`)}
      />
      <ListRow
        title="Schedules"
        subtitle="Lịch chạy pipeline"
        icon={CalendarClock}
        onPress={() => router.push(`/projects/${projectId}/schedules`)}
      />
      <ListRow
        title="CI lint"
        subtitle="Kiểm tra cấu hình CI"
        icon={FileCheck}
        onPress={() => router.push(`/projects/${projectId}/ci-lint`)}
      />
      {!!query.error && (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      )}
      {!!action.error && <ErrorNotice error={action.error} />}
    </Body>
  );
}
