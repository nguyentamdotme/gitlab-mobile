import React, { useState } from "react";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Card,
  Button,
  Field,
  ErrorNotice,
  Status,
  SectionHeading,
  useResource,
} from "../../components/ui";
import { api, useApp } from "../../core/query/provider";
import { issueSchema } from "../../core/gitlab/types";
import { projectPath } from "../../core/gitlab/client";
import { PolicyError } from "../../core/security/action-policy";
import { useGitLabMutation } from "../mutation-action";
export function IssueDetail({
  projectId,
  id,
}: {
  projectId: number;
  id: number;
}) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const path = `${projectPath(projectId)}/issues/${id}`;
  const query = useResource(["issue", projectId, id], async (signal) =>
    issueSchema.parse(await api.detail(projectId, "issues", id, signal)),
  );
  const [page, setPage] = useState(1);
  const notes = useResource(["issue-notes", projectId, id, page], (signal) =>
    api.notes(projectId, id, page, signal),
  );
  const [comment, setComment] = useState("");
  const [labels, setLabels] = useState("");
  const [assignees, setAssignees] = useState("");
  const [edit, setEdit] = useState(false);
  const disabled = mutation.busy || !!app.pendingIntent || !app.online;
  const update = (body: unknown, name: string) =>
    void mutation.run(async () => {
      const previous = query.data;
      await mutation.execute(
        name,
        `Issue #${id}: ${previous?.title}`,
        { action: "issue-update", targetId: id },
        async () => {
          const latest = issueSchema.parse(
            await api.detail(projectId, "issues", id),
          );
          if (latest.updated_at !== previous?.updated_at)
            throw new PolicyError("Issue đã thay đổi. Tải lại trước khi sửa.");
          return api.write(path, "PUT", body);
        },
      );
      setEdit(false);
    });
  return (
    <Body>
      <Heading>
        #{id} {query.data?.title}
      </Heading>
      {query.data && <Status value={query.data.state} />}
      {!!query.data?.description && (
        <Card>
          <Copy>{query.data.description}</Copy>
        </Card>
      )}
      {query.data && (
        <Button
          title={query.data.state === "closed" ? "Mở lại issue" : "Đóng issue"}
          disabled={disabled}
          onPress={() =>
            update(
              {
                state_event:
                  query.data!.state === "closed" ? "reopen" : "close",
              },
              "Đổi trạng thái issue",
            )
          }
        />
      )}
      <Caption>
        Labels: {query.data?.labels?.join(", ") || "—"} · Assigned:{" "}
        {query.data?.assignees?.map((a) => a.username).join(", ") || "—"}
      </Caption>
      <Button
        title="Sửa labels / assignees"
        disabled={disabled}
        onPress={() => {
          setLabels(query.data?.labels?.join(",") || "");
          setAssignees(query.data?.assignees?.map((a) => a.id).join(",") || "");
          setEdit(!edit);
        }}
      />
      {edit && (
        <Card>
          <Field
            label="Labels (phân cách dấu phẩy)"
            value={labels}
            onChange={setLabels}
          />
          <Field
            label="Assignee user IDs (dấu phẩy; để trống bỏ gán)"
            value={assignees}
            onChange={setAssignees}
          />
          <Button
            title="Lưu metadata"
            variant="primary"
            disabled={disabled}
            onPress={() => {
              const ids = assignees.trim()
                ? assignees.split(",").map((v) => Number(v.trim()))
                : [];
              if (ids.some((v) => !Number.isSafeInteger(v) || v < 1)) {
                void mutation.run(async () => {
                  throw new PolicyError("User IDs phải là số nguyên dương.");
                });
                return;
              }
              update({ labels, assignee_ids: ids }, "Sửa labels / assignees");
            }}
          />
        </Card>
      )}
      <SectionHeading title="Bình luận" />
      {notes.data?.items.map((note) => (
        <Card key={note.id}>
          <Caption>
            {note.author?.username}
            {note.system ? " · system" : ""}
          </Caption>
          <Copy>{note.body}</Copy>
        </Card>
      ))}
      {page > 1 && (
        <Button
          title="Comments trang trước"
          onPress={() => setPage(page - 1)}
        />
      )}
      {notes.data?.next && (
        <Button
          title="Comments trang tiếp"
          onPress={() => setPage(notes.data!.next!)}
        />
      )}
      <Field
        label="Comment (draft chỉ trong RAM)"
        value={comment}
        onChange={setComment}
        multiline
      />
      <Button
        title="Gửi comment"
        variant="primary"
        disabled={disabled || !comment.trim()}
        onPress={() =>
          void mutation.run(async () => {
            await mutation.execute(
              "Gửi comment",
              `Issue #${id}\n${comment.slice(0, 100)}`,
              { action: "issue-comment", targetId: id },
              () => api.write(path + "/notes", "POST", { body: comment }),
            );
            setComment("");
          })
        }
      />
      {!!query.error && (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      )}
      {!!notes.error && <ErrorNotice error={notes.error} />}
      {!!mutation.error && <ErrorNotice error={mutation.error} />}
    </Body>
  );
}
