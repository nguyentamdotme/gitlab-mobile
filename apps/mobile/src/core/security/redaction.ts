export function safeError(error: unknown): string {
  if (error instanceof Error && error.name === "GitLabError")
    return error.message;
  if (
    error instanceof Error &&
    ["SessionError", "PolicyError", "TransferError"].includes(error.name)
  )
    return error.message;
  return "Không thể hoàn tất. Kiểm tra kết nối và thử tải lại; lệnh ghi không được gửi lại tự động.";
}
