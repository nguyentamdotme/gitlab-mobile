import React, { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { api } from "../../../core/query/provider";
import { projectPath } from "../../../core/gitlab/client";
import { segment } from "../../../core/security/trusted-url";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Card,
  Button,
  ErrorNotice,
  useResource,
  ListRow,
  SectionHeading,
} from "../../../components/ui";
import { Folder, FileText, GitCommitHorizontal } from "lucide-react-native";
import { RefPicker, RefChoice } from "../../../features/ref-picker";
import { treeSchema, commitSchema } from "../../../features/gitlab-api";
import { PolicyError } from "../../../core/security/action-policy";
const fileSchema = z.object({
  file_path: z.string(),
  size: z.number(),
  encoding: z.literal("base64"),
  content: z.string(),
});
export default function Repository() {
  const { projectId: input } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(input);
  const path = projectPath(projectId);
  const [ref, setRef] = useState<RefChoice | null>(null);
  const [directory, setDirectory] = useState("");
  const [file, setFile] = useState("");
  const [page, setPage] = useState(1);
  const [commitPage, setCommitPage] = useState(1);
  const [sha, setSha] = useState("");
  const tree = useResource(
    ["tree", projectId, ref?.sha, directory, page],
    (signal) =>
      ref
        ? api.list(
            path + "/repository/tree",
            treeSchema,
            { ref: ref.sha, path: directory, page },
            signal,
          )
        : Promise.resolve({ items: [] }),
  );
  const content = useResource(
    ["file", projectId, ref?.sha, file],
    async (signal) => {
      if (!file || !ref) return null;
      const data = fileSchema.parse(
        await api.client.json(path + `/repository/files/${segment(file)}`, {
          params: { ref: ref.sha },
          signal,
        }),
      );
      if (data.size > 256 * 1024 || data.content.length > 350_000)
        throw new PolicyError("File quá lớn để render (tối đa 256 KiB).");
      const bytes = Uint8Array.from(
        atob(data.content.replace(/\s/g, "")),
        (c) => c.charCodeAt(0),
      );
      const text = new TextDecoder().decode(bytes);
      if (/[\u0000-\u0008\u000e-\u001f]/.test(text) || text.includes("\ufffd"))
        throw new PolicyError(
          "File binary hoặc encoding chưa hỗ trợ; không render text.",
        );
      return text;
    },
  );
  const commits = useResource(
    ["commits", projectId, ref?.sha, commitPage],
    (signal) =>
      ref
        ? api.list(
            path + "/repository/commits",
            commitSchema,
            { ref_name: ref.sha, page: commitPage },
            signal,
          )
        : Promise.resolve({ items: [] }),
  );
  const commit = useResource(["commit", projectId, sha], async (signal) =>
    sha
      ? commitSchema.parse(
          await api.client.json(path + `/repository/commits/${segment(sha)}`, {
            signal,
          }),
        )
      : null,
  );
  return (
    <Body>
      <Heading>Repository</Heading>
      <RefPicker
        projectId={projectId}
        value={ref}
        onChange={(value) => {
          setRef(value);
          setPage(1);
          setDirectory("");
          setFile("");
          setSha("");
        }}
      />
      <Caption>{directory || "/"}</Caption>
      {directory && (
        <Button
          title="Thư mục cha"
          onPress={() => {
            setDirectory(directory.split("/").slice(0, -1).join("/"));
            setPage(1);
            setFile("");
          }}
        />
      )}
      {tree.data?.items.map((item) => (
        <ListRow
          key={item.id + item.path}
          icon={item.type === "tree" ? Folder : FileText}
          title={item.name}
          subtitle={item.type === "tree" ? "Thư mục" : "Tệp"}
          onPress={() => {
            if (item.type === "tree") {
              setDirectory(item.path);
              setPage(1);
              setFile("");
            } else if (item.type === "blob") setFile(item.path);
          }}
        />
      ))}
      {page > 1 && (
        <Button title="Tree trang trước" onPress={() => setPage(page - 1)} />
      )}
      {"next" in (tree.data || {}) && tree.data?.next && (
        <Button
          title="Tree trang tiếp"
          onPress={() => setPage(tree.data!.next!)}
        />
      )}
      {file && (
        <Card>
          <Copy>{file}</Copy>
          <Copy mono>{content.data}</Copy>
          <Button title="Đóng file" onPress={() => setFile("")} />
        </Card>
      )}
      <SectionHeading title="Commits" />
      {commits.data?.items.map((item) => (
        <ListRow
          key={item.id}
          icon={GitCommitHorizontal}
          title={item.title}
          subtitle={item.short_id}
          onPress={() => setSha(item.id)}
        />
      ))}
      {commitPage > 1 && (
        <Button
          title="Commits trang trước"
          onPress={() => setCommitPage(commitPage - 1)}
        />
      )}
      {"next" in (commits.data || {}) && commits.data?.next && (
        <Button
          title="Commits trang tiếp"
          onPress={() => setCommitPage(commits.data!.next!)}
        />
      )}
      {commit.data && (
        <Card>
          <Copy>{commit.data.title}</Copy>
          <Caption>
            {commit.data.author_name} · {commit.data.created_at}
          </Caption>
          <Copy mono>{commit.data.id}</Copy>
          <Copy>{commit.data.message}</Copy>
        </Card>
      )}
      {[tree.error, content.error, commits.error, commit.error]
        .filter(Boolean)
        .map((error, index) => (
          <ErrorNotice key={index} error={error} />
        ))}
    </Body>
  );
}
