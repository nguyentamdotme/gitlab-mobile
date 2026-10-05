import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import { GitLabClient, projectPath } from "../../core/gitlab/client";
import {
  Fetcher,
  readBounded,
  TransferError,
} from "../../core/gitlab/transport";
import { artifactResponse } from "../../core/gitlab/artifact-transport";

export const transfersVerified = () =>
  Constants.expoConfig?.extra?.boundedTransfersVerified === true;
export const stripAnsi = (value: string) =>
  value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const transferDirectory = () => new Directory(Paths.cache, "gitlab-artifacts");
export function cleanArtifacts() {
  const directory = transferDirectory();
  if (directory.exists) directory.delete();
}
export async function readTrace(
  client: GitLabClient,
  projectId: number,
  jobId: number,
  signal: AbortSignal,
): Promise<string> {
  if (!transfersVerified())
    throw new TransferError(
      "Log streaming đang khóa tới khi kiểm chứng byte cap trên native build. Xem GitLab qua liên kết HTTPS.",
    );
  const controller = new AbortController();
  const response = await client.request(
    `${projectPath(projectId)}/jobs/${jobId}/trace`,
    { signal: AbortSignal.any([signal, controller.signal]) },
  );
  return stripAnsi(
    new TextDecoder().decode(
      await readBounded(response, 1024 * 1024, controller),
    ),
  );
}
export async function downloadArtifact(
  client: GitLabClient,
  fetcher: Fetcher,
  projectId: number,
  jobId: number,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<File> {
  if (!transfersVerified())
    throw new TransferError(
      "Tải artifact đang khóa tới khi kiểm chứng native redirect/streaming.",
    );
  const account = client.session.account;
  if (!account) throw new TransferError("Kết nối lại GitLab.");
  const epoch = client.session.generation;
  const controller = new AbortController();
  const combined = AbortSignal.any([
    signal,
    controller.signal,
    client.session.signal,
    AbortSignal.timeout(120_000),
  ]);
  const token = await client.session.ensureToken();
  const response = await artifactResponse(
    fetcher,
    account.instance,
    client.url(`${projectPath(projectId)}/jobs/${jobId}/artifacts`),
    token.accessToken,
    combined,
  );
  if (!response?.ok || !response.body)
    throw new TransferError(
      "Artifact đã hết hạn, bị từ chối hoặc không hỗ trợ streaming.",
    );
  const limit = 128 * 1024 * 1024;
  if (
    Number(response.headers.get("content-length")) > limit ||
    Paths.availableDiskSpace < limit + 32 * 1024 * 1024
  ) {
    controller.abort();
    await response.body.cancel();
    throw new TransferError(
      "Artifact vượt quota hoặc thiết bị thiếu dung lượng.",
    );
  }
  const directory = transferDirectory();
  if (!directory.exists) directory.create();
  for (const item of directory.list()) if (item instanceof File) item.delete();
  const file = new File(directory, `project-${projectId}-job-${jobId}.zip`);
  file.create({ overwrite: true });
  const handle = file.open();
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (
        size > limit ||
        combined.aborted ||
        epoch !== client.session.generation
      ) {
        controller.abort();
        throw new TransferError("Tải đã hủy hoặc vượt quota.");
      }
      handle.writeBytes(chunk.value);
      onProgress(size);
    }
    if (combined.aborted || epoch !== client.session.generation)
      throw new TransferError("Tải đã hủy.");
    return file;
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  } finally {
    handle.close();
    await reader.cancel().catch(() => undefined);
  }
}
export async function shareArtifact(file: File) {
  if (!(await Sharing.isAvailableAsync()))
    throw new TransferError("Thiết bị không hỗ trợ chia sẻ.");
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/zip",
      UTI: "public.zip-archive",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
