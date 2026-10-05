export class GitLabError extends Error {
  name = "GitLabError";
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(
      (
        {
          400: "GitLab từ chối tham số hoặc cấu hình CI.",
          401: "Phiên không còn hợp lệ; hãy kết nối lại.",
          403: "GitLab từ chối do quyền hoặc policy của project.",
          404: "Không tìm thấy, không có quyền hoặc tính năng chưa hỗ trợ.",
          409: "Trạng thái hoặc revision đã đổi. Hãy tải lại.",
          422: "GitLab từ chối dữ liệu. Kiểm tra cấu hình và quyền.",
          429: "GitLab giới hạn số request. Hãy chờ và tải lại.",
        } as Record<number, string>
      )[status] || `GitLab trả lỗi HTTP ${status}.`,
    );
  }
}
export class UnknownMutation extends Error {
  name = "SessionError";
  constructor() {
    super(
      "Chưa xác định kết quả. Kiểm tra lại trên GitLab trước khi xác nhận gửi lệnh khác.",
    );
  }
}
