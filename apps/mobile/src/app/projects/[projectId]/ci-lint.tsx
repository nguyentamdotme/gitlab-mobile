import React, { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { api } from "../../../core/query/provider";
import { projectPath } from "../../../core/gitlab/client";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Field,
  Button,
  ErrorNotice,
  useAction,
  Status,
  Card,
} from "../../../components/ui";
const lintSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
  })
  .passthrough();
export default function Lint() {
  const { projectId: input } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(input);
  const action = useAction();
  const [content, setContent] = useState("");
  const [ref, setRef] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<z.infer<typeof lintSchema>>();
  const run = () =>
    void action.run(async () => {
      const epoch = api.client.session.generation;
      const value = lintSchema.parse(
        content.trim()
          ? await api.write(projectPath(projectId) + "/ci/lint", "POST", {
              content,
              dry_run: dryRun,
              ...(ref ? { ref } : {}),
            })
          : await api.client.json(projectPath(projectId) + "/ci/lint", {
              params: {
                ...(ref ? { content_ref: ref, dry_run_ref: ref } : {}),
                dry_run: dryRun,
              },
            }),
      );
      if (epoch === api.client.session.generation) setResult(value);
    });
  return (
    <Body>
      <Heading>CI lint</Heading>
      <Caption>
        Kiểm tra cấu hình/dry run rules. Không chạy pipeline; lint pass không
        bảo đảm deploy thành công.
      </Caption>
      <Field label="Ref context (optional)" value={ref} onChange={setRef} />
      <Field
        label="YAML draft (để trống kiểm tra config hiện có)"
        value={content}
        onChange={setContent}
        multiline
      />
      <Button
        title={dryRun ? "Tắt dry run" : "Bật dry run rules"}
        onPress={() => setDryRun(!dryRun)}
      />
      <Button
        title="Kiểm tra"
        variant="primary"
        disabled={action.busy}
        onPress={run}
      />
      {result && (
        <Card>
          <Status value={result.valid ? "success" : "failed"} />
          <Copy>{result.errors?.join("\n")}</Copy>
          <Copy>{result.warnings?.join("\n")}</Copy>
        </Card>
      )}
      {!!action.error && <ErrorNotice error={action.error} />}
    </Body>
  );
}
