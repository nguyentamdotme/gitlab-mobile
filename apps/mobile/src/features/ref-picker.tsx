import React, { useState } from "react";
import {
  Button,
  Copy,
  Card,
  Caption,
  Field,
  useResource,
  ErrorNotice,
  ChoiceChips,
  ListRow,
} from "../components/ui";
import { GitBranch, Tag } from "lucide-react-native";
import { api } from "../core/query/provider";
import type { z } from "zod";
import { branchSchema } from "./gitlab-api";
export type RefChoice = { name: string; kind: "branch" | "tag"; sha: string };
export function RefPicker({
  projectId,
  value,
  onChange,
  label = "Chọn branch/tag",
  branchesOnly = false,
}: {
  projectId: number;
  value: RefChoice | null;
  onChange(value: RefChoice): void;
  label?: string;
  branchesOnly?: boolean;
}) {
  const [kind, setKind] = useState<"branch" | "tag">("branch");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useResource(["refs", projectId, kind, page], (signal) =>
    kind === "branch"
      ? api.branches(projectId, page, signal)
      : api.tags(projectId, page, signal),
  );
  const searchTerm = search.toLowerCase();
  const refs = query.data?.items.filter((ref: z.infer<typeof branchSchema>) =>
    ref.name.toLowerCase().includes(searchTerm),
  );
  const nextPage = query.data?.next;

  return (
    <Card>
      <Copy>{label}</Copy>
      {value && (
        <Caption>
          {value.kind}: {value.name} · {value.sha.slice(0, 10)}
        </Caption>
      )}
      {!branchesOnly && (
        <ChoiceChips
          options={[
            { value: "branch", label: "Branches" },
            { value: "tag", label: "Tags" },
          ]}
          value={kind}
          onChange={(nextKind) => {
            setKind(nextKind);
            setPage(1);
          }}
        />
      )}
      <Field
        label="Lọc trang refs hiện tại"
        value={search}
        onChange={setSearch}
      />
      {refs?.map((ref) => (
        <ListRow
          key={ref.name}
          icon={kind === "branch" ? GitBranch : Tag}
          title={ref.name}
          subtitle={ref.commit.id.slice(0, 8)}
          onPress={() => onChange({ name: ref.name, kind, sha: ref.commit.id })}
        />
      ))}
      {page > 1 && (
        <Button title="Trang trước" onPress={() => setPage(page - 1)} />
      )}
      {nextPage && (
        <Button title="Trang refs tiếp" onPress={() => setPage(nextPage)} />
      )}
      {!!query.error && (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      )}
    </Card>
  );
}
