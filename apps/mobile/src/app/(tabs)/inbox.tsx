import React, { useState } from "react";
import { router } from "expo-router";
import { z } from "zod";
import { CircleDot, GitPullRequest } from "lucide-react-native";
import { api, useApp } from "../../core/query/provider";
import { PagedList, ChoiceChips, ListRow } from "../../components/ui";
const inboxSchema = z.object({
  id: z.number(),
  iid: z.number(),
  project_id: z.number(),
  title: z.string(),
  state: z.string(),
});
export default function Inbox() {
  const app = useApp();
  const [kind, setKind] = useState<"issues" | "merge-requests">(
    "merge-requests",
  );
  return (
    <PagedList
      title="Inbox"
      queryKey={["inbox", kind]}
      load={(page, signal) =>
        api.list(
          kind === "issues" ? "/issues" : "/merge_requests",
          inboxSchema,
          {
            page,
            state: "opened",
            scope: "all",
            ...(kind === "issues"
              ? { assignee_id: app.account!.userId }
              : { reviewer_id: app.account!.userId }),
          },
          signal,
        )
      }
      header={
        <ChoiceChips<"issues" | "merge-requests">
          options={[
            { value: "merge-requests", label: "Cần review" },
            { value: "issues", label: "Issue của tôi" },
          ]}
          value={kind}
          onChange={setKind}
        />
      }
      renderItem={(item) => (
        <ListRow
          title={item.title}
          subtitle={`${kind === "issues" ? "Issue #" : "MR !"}${item.iid}`}
          icon={kind === "issues" ? CircleDot : GitPullRequest}
          onPress={() =>
            router.push(`/projects/${item.project_id}/${kind}/${item.iid}`)
          }
        />
      )}
    />
  );
}
