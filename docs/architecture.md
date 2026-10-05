# Kiến trúc và quyết định

Tài liệu này giữ các ranh giới và lý do khó suy ra chỉ từ tên file. Source,
schema và script là nơi quyết định ứng dụng thực hiện gì và thực hiện thế nào.

## Ranh giới hệ thống

| Ranh giới | Nơi thực thi | Tài liệu vận hành hoặc chính sách |
| --- | --- | --- |
| Mobile app, routes và UI | [`apps/mobile/src/app`](../apps/mobile/src/app) và [`apps/mobile/src/features`](../apps/mobile/src/features) | [Development](development.md) |
| Session, credential và account isolation | [`SessionManager`](../apps/mobile/src/core/auth/session-manager.ts) và [`CredentialStore`](../apps/mobile/src/core/auth/credential-store.ts) | [Privacy](privacy.md), [Security](security.md) |
| GitLab data plane và server state | [`AppProvider`](../apps/mobile/src/core/query/provider.tsx), [`GitLabApi`](../apps/mobile/src/features/gitlab-api.ts) | [API design contract](../plans/20261004-1731-gitlab-mobile/api-contract.md) |
| CI mutations và safety policy | [`action-policy.ts`](../apps/mobile/src/core/security/action-policy.ts), [`mutation-reconciliation.ts`](../apps/mobile/src/core/gitlab/mutation-reconciliation.ts) | [CI policy](project-ci-policy.md) |
| Notification receiver và delivery | [`apps/notification-service/src/main.ts`](../apps/notification-service/src/main.ts), [`packages/contracts/src/index.ts`](../packages/contracts/src/index.ts) | [Notification service](notifications-operations.md) |

Mobile gọi GitLab trực tiếp. Notification service là một boundary tùy chọn cho
webhook và push; nó không trở thành nơi giữ grant hoặc refresh token GitLab lâu
dài. Vì vậy các thao tác GitLab vẫn có cùng account, quyền và khả năng truy cập
khi service thông báo chưa được triển khai hoặc không khả dụng.

## Quyết định và lý do

### Gọi GitLab trực tiếp từ mobile

Mobile cần hành động trong quyền của account đang đăng nhập và phải giữ token ở
secure storage của thiết bị. Đưa luồng CRUD qua backend sẽ mở rộng boundary
credential và tạo dependency triển khai cho các thao tác vốn có thể chạy trực
tiếp. Backend chỉ nhận phần notification cần webhook, xác minh quyền ngắn hạn
và gửi payload opaque; chi tiết dữ liệu vẫn được đọc từ GitLab khi người dùng mở
app.

### Không tự động gửi lại lệnh ghi

Timeout hoặc process death sau khi GitLab đã nhận một lệnh khiến kết quả không
xác định. Gửi lại âm thầm có thể tạo pipeline, comment hoặc thay đổi deployment
lần thứ hai. App giữ metadata intent để reconcile bằng việc đọc lại rồi yêu cầu
người dùng xác nhận; quy tắc này được thực thi tại
[`MutationRunner`](../apps/mobile/src/core/gitlab/mutation-reconciliation.ts) và
được mô tả trong [Development](development.md).

### CI mặc định fail-closed

Tên job hoặc một hộp thoại xác nhận không đủ để suy ra ref, environment và tác
động của CI. Mọi CI mutation bắt đầu ở trạng thái bị khóa và chỉ mở khi chủ
project lưu policy đã kiểm thử cho đúng instance, project, ref và environment.
[`requireCiPolicy`](../apps/mobile/src/core/security/action-policy.ts) là owner
thực thi; [CI policy](project-ci-policy.md) là nơi ghi quyết định và giới hạn.

### Khóa native transfer cho tới khi có bằng chứng native

Implementation JavaScript có thể giới hạn stream và redirect, nhưng unit test
không chứng minh runtime native không buffer toàn bộ dữ liệu hoặc không chuyển
credential qua redirect. Vì rủi ro memory và credential leak nằm ở transport,
flag mặc định giữ log/artifact transfer ở trạng thái khóa; chỉ mở sau PoC trên
runtime và thiết bị mục tiêu đạt các điều kiện trong
[Development](development.md).

### CNG cục bộ tách khỏi phát hành

Người dùng cần chạy app trên iPhone qua cáp để kiểm tra cá nhân. Cấu hình Expo
được sinh từ [`app.config.ts`](../apps/mobile/app.config.ts), và APNs chỉ tham
gia khi cấu hình EAS project ID. Đây là boundary của local development; signing local theo [iPhone guide](iphone-local-build.md);
entitlement, live release validation và store submission theo [Release](release.md),
không được suy ra từ việc bundle hoặc CNG đã chạy.

## Nơi cập nhật

- Thay đổi hành vi hoặc boundary: cập nhật source owner được liên kết ở trên,
  sau đó chỉ cập nhật tài liệu này nếu lý do hoặc nơi tìm kiếm thay đổi.
- Thay đổi toolchain, local device workflow hoặc test contract: cập nhật
  [Development](development.md).
- Thay đổi CI allowlist hoặc điều kiện safety: cập nhật
  [CI policy](project-ci-policy.md).
- Thay đổi notification route hoặc quyền operator: cập nhật
  [Notification service](notifications-operations.md).
- Bằng chứng chạy thực tế: cập nhật [Verification results](verification-results.md),
  không đưa snapshot vào tài liệu kiến trúc.

