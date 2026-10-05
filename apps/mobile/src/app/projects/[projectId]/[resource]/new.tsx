import React from "react";
import { useLocalSearchParams } from "expo-router";
import CreateResource from "../../../../features/forms";
import type { Resource } from "../../../../features/gitlab-api";
export default function Create() {
  const params = useLocalSearchParams<{
    projectId: string;
    resource: Resource;
  }>();
  return (
    <CreateResource
      projectId={Number(params.projectId)}
      resource={params.resource}
    />
  );
}
