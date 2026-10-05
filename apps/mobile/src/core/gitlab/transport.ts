export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class TransferError extends Error {
  name = "TransferError";
}
export async function readBounded(
  response: Response,
  maxBytes: number,
  controller?: AbortController,
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    controller?.abort();
    await response.body?.cancel();
    throw new TransferError("Nội dung vượt giới hạn byte.");
  }
  if (!response.body)
    throw new TransferError(
      "Transport không hỗ trợ streaming; không tải toàn bộ vào RAM.",
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        controller?.abort();
        throw new TransferError("Nội dung vượt giới hạn byte.");
      }
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
