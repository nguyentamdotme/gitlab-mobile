import React, { useState } from "react";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Card,
  Field,
  Button,
  ErrorNotice,
  useResource,
  openExternal,
  Status,
  SectionHeading,
} from "../../components/ui";
import { api, useApp } from "../../core/query/provider";
import { mrSchema } from "../../core/gitlab/types";
import { projectPath } from "../../core/gitlab/client";
import { segment } from "../../core/security/trusted-url";
import { PolicyError } from "../../core/security/action-policy";
import { useGitLabMutation } from "../mutation-action";
import { z } from "zod";
export function MrDetail({ projectId, id }: { projectId: number; id: number }) {
  const app = useApp();
  const mutation = useGitLabMutation(projectId);
  const path = `${projectPath(projectId)}/merge_requests/${id}`;
  const query = useResource(["mr", projectId, id], async (signal) =>
    mrSchema.parse(await api.detail(projectId, "merge-requests", id, signal)),
  );
  const [diffPage, setDiffPage] = useState(1);
  const [discussionPage, setDiscussionPage] = useState(1);
  const diffs = useResource(
    ["diffs", projectId, id, query.data?.sha, diffPage],
    (signal) => api.diffs(projectId, id, diffPage, signal),
  );
  const discussions = useResource(
    ["discussions", projectId, id, discussionPage],
    (signal) => api.discussions(projectId, id, discussionPage, signal),
  );
  const approvals = useResource(["approvals", projectId, id], async (signal) =>
    z
      .object({
        approved: z.boolean().optional(),
        approvals_left: z.number().optional(),
      })
      .passthrough()
      .parse(await api.client.json(path + "/approvals", { signal })),
  );
  const [body, setBody] = useState("");
  const [replyId, setReplyId] = useState("");
  const [inline, setInline] = useState<{
    oldPath: string;
    newPath: string;
    sha: string;
  } | null>(null);
  const [line, setLine] = useState("");
  const [oldLine, setOldLine] = useState(false);
  const mr = query.data;
  const disabled = mutation.busy || !!app.pendingIntent || !app.online || !mr;
  const policy = app.preferences.policies.find(
    (p) => p.projectId === projectId && p.instance === app.account?.instance,
  );
  const approvalUnavailable = policy?.approvalReauthentication === true;
  const revisionAction = (command: "approve" | "unapprove" | "merge") =>
    void mutation.run(async () => {
      if (!mr) return;
      if (approvalUnavailable && command === "approve")
        throw new PolicyError(
          "Policy yêu cầu reauthentication. Dùng GitLab qua trình duyệt hệ thống.",
        );
      await mutation.execute(
        command,
        `MR !${id}\n${mr.title}\nHEAD ${mr.sha}\nCI ${mr.head_pipeline?.status || "chưa có"}\nMerge status: ${mr.detailed_merge_status || "unknown"}`,
        { action: `mr-${command}`, targetId: id, sha: mr.sha },
        async () => {
          const latest = await api.guardMr(projectId, id, mr.sha);
          if (
            command === "merge" &&
            (latest.detailed_merge_status !== "mergeable" ||
              (latest.head_pipeline &&
                latest.head_pipeline.status !== "success"))
          )
            throw new PolicyError(
              "MR chưa mergeable hoặc pipeline chưa success. GitLab quyết định policy cuối cùng.",
            );
          return api.write(
            path + "/" + command,
            command === "merge" ? "PUT" : "POST",
            command === "unapprove" ? undefined : { sha: mr.sha },
          );
        },
        { destructive: command === "merge" },
      );
    });
  return (
    <Body>
      <Heading>
        !{id} {mr?.title}
      </Heading>
      <Caption>
        {mr?.source_branch} → {mr?.target_branch}
      </Caption>
      {mr && <Status value={mr.state} />}
      <Caption>HEAD {mr?.sha}</Caption>
      {!!mr?.description && (
        <Card>
          <Copy>{mr.description}</Copy>
        </Card>
      )}
      <Copy>
        CI: {mr?.head_pipeline?.status || "chưa có"} ·{" "}
        {mr?.detailed_merge_status || "unknown"}
      </Copy>
      <Caption>
        Approvals: {approvals.data?.approved ? "approved" : "chưa approved"} ·
        còn {approvals.data?.approvals_left ?? "unknown"}
      </Caption>
      <Button
        title="Approve HEAD SHA"
        variant="primary"
        disabled={disabled || approvalUnavailable || mr?.state !== "opened"}
        onPress={() => revisionAction("approve")}
      />
      <Button
        title="Unapprove"
        disabled={disabled || mr?.state !== "opened"}
        onPress={() => revisionAction("unapprove")}
      />
      <Button
        title="Merge với SHA guard"
        danger
        disabled={disabled || mr?.detailed_merge_status !== "mergeable"}
        onPress={() => revisionAction("merge")}
      />
      {approvalUnavailable && (
        <Caption>
          Approval cần reauthentication; app không thu mật khẩu. Mở GitLab để
          thực hiện.
        </Caption>
      )}
      {mr?.web_url && (
        <Button
          title="Mở MR trên GitLab"
          onPress={() => void mutation.run(() => openExternal(mr.web_url!))}
        />
      )}
      <SectionHeading title="Thay đổi theo file" />
      {diffs.data?.items.map((diff) => (
        <Card key={diff.new_path}>
          <Copy>{diff.new_path}</Copy>
          {diff.too_large || diff.collapsed || !diff.diff ? (
            <Caption>
              Diff vượt giới hạn hoặc collapsed trên GitLab. Xem website.
            </Caption>
          ) : (
            <>
              <Copy mono>{diff.diff}</Copy>
              <Button
                title="Comment dòng trong file"
                disabled={disabled || !mr?.diff_refs}
                onPress={() => {
                  setInline({
                    oldPath: diff.old_path,
                    newPath: diff.new_path,
                    sha: mr!.sha,
                  });
                  setReplyId("");
                }}
              />
            </>
          )}
        </Card>
      ))}
      {diffPage > 1 && (
        <Button
          title="Diffs trang trước"
          onPress={() => setDiffPage(diffPage - 1)}
        />
      )}
      {diffs.data?.next && (
        <Button
          title="Diffs trang tiếp"
          onPress={() => setDiffPage(diffs.data!.next!)}
        />
      )}
      <SectionHeading title="Thảo luận" />
      {discussions.data?.items.map((thread) => (
        <Card key={thread.id}>
          {thread.notes.map((note) => (
            <ViewNote
              key={note.id}
              username={note.author?.username}
              body={note.body}
            />
          ))}
          <Button
            title="Reply thread"
            disabled={disabled}
            onPress={() => {
              setReplyId(thread.id);
              setInline(null);
            }}
          />
          {thread.notes.some((n) => n.resolvable) && (
            <Button
              title={
                thread.notes.every((n) => !n.resolvable || n.resolved)
                  ? "Unresolve"
                  : "Resolve"
              }
              disabled={disabled}
              onPress={() =>
                void mutation.run(async () =>
                  mutation.execute(
                    "Đổi trạng thái discussion",
                    `MR !${id} · thread ${thread.id}`,
                    {
                      action: "mr-discussion-resolve",
                      targetId: id,
                      sha: mr?.sha,
                    },
                    async () => {
                      await api.guardMr(projectId, id, mr!.sha);
                      return api.write(
                        path + `/discussions/${segment(thread.id)}`,
                        "PUT",
                        {
                          resolved: !thread.notes.every(
                            (n) => !n.resolvable || n.resolved,
                          ),
                        },
                      );
                    },
                  ),
                )
              }
            />
          )}
        </Card>
      ))}
      {discussionPage > 1 && (
        <Button
          title="Discussions trang trước"
          onPress={() => setDiscussionPage(discussionPage - 1)}
        />
      )}
      {discussions.data?.next && (
        <Button
          title="Discussions trang tiếp"
          onPress={() => setDiscussionPage(discussions.data!.next!)}
        />
      )}
      {(inline || replyId) && (
        <Card>
          <Caption>
            {inline
              ? `Inline ${inline.newPath} · HEAD ${inline.sha.slice(0, 8)}`
              : `Reply ${replyId}`}
          </Caption>
          <Button
            title="Chuyển comment chung"
            onPress={() => {
              setReplyId("");
              setInline(null);
            }}
          />
        </Card>
      )}
      {inline && (
        <>
          <Field
            label={oldLine ? "Số dòng bên old" : "Số dòng bên new"}
            value={line}
            onChange={setLine}
          />
          <Button
            title={oldLine ? "Dùng new line" : "Dùng old line (dòng đã xóa)"}
            onPress={() => setOldLine(!oldLine)}
          />
        </>
      )}
      <Field
        label="Comment / reply (draft trong RAM)"
        value={body}
        onChange={setBody}
        multiline
      />
      <Button
        title="Gửi"
        disabled={disabled || !body.trim()}
        onPress={() =>
          void mutation.run(async () => {
            if (!mr) return;
            const lineNumber = Number(line);
            if (
              inline &&
              (!Number.isSafeInteger(lineNumber) ||
                lineNumber < 1 ||
                inline.sha !== mr.sha ||
                !mr.diff_refs)
            )
              throw new PolicyError(
                "Inline position không hợp lệ hoặc revision đã thay đổi. Chọn lại file.",
              );
            await mutation.execute(
              "Gửi discussion",
              `MR !${id}\nHEAD ${mr.sha}`,
              { action: "mr-comment", targetId: id, sha: mr.sha },
              async () => {
                const latest = await api.guardMr(projectId, id, mr.sha);
                const position = inline
                  ? {
                      position_type: "text",
                      ...latest.diff_refs,
                      old_path: inline.oldPath,
                      new_path: inline.newPath,
                      ...(oldLine
                        ? { old_line: lineNumber }
                        : { new_line: lineNumber }),
                    }
                  : undefined;
                return api.write(
                  path +
                    `/discussions${replyId ? `/${segment(replyId)}/notes` : ""}`,
                  "POST",
                  { body, ...(position ? { position } : {}) },
                );
              },
            );
            setBody("");
            setInline(null);
            setReplyId("");
          })
        }
      />
      {[
        query.error,
        diffs.error,
        discussions.error,
        approvals.error,
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
function ViewNote({ username, body }: { username?: string; body: string }) {
  return (
    <>
      <Caption>{username}</Caption>
      <Copy>{body}</Copy>
    </>
  );
}
