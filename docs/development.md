# Development

## Toolchain và workspace

Dùng Node 24.21+ và pnpm 12.9.1. Expo SDK 57 yêu cầu Node tối thiểu 22.13 và React Native 0.86; dependency được resolve bằng Expo CLI và pin qua `pnpm-lock.yaml`. TypeScript dùng 6.0 để tương thích ESLint. `test-renderer` pin 1.2.0 để khớp React 19.2 của SDK.

- `apps/mobile`: Expo Router; route tại `src/app`, business logic tại `src/core` và `src/features`.
- `apps/notification-service`: Fastify receiver và PostgreSQL outbox worker, độc lập với API mobile.
- `packages/contracts`: push/service contracts, không chứa GitLab credentials.

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r lint
pnpm test:unit
pnpm test:contracts:fixtures
pnpm test:security
pnpm test:notifications:integration
```

Integration cần Docker và port 55432 trống. Runner tạo PostgreSQL disposable, backup trước migration, rồi stop container trong `finally`. Không dùng DB hiện có. Khi port bận, tìm owner; không đổi port để tạo thêm server.

## Start/build và chạy thiết bị

[Hướng dẫn iPhone local build](iphone-local-build.md) là owner duy nhất cho setup Mac/Xcode, Metro, signing Personal Team, build Debug/Release và cài qua cáp. Native output dùng CNG; không commit output `ios/`/`android/`. Thay native config trong [app config](../apps/mobile/app.config.ts) và plugins.

## Giao diện mobile

Giao diện dùng nền tím pastel nhạt, card trắng và trạng thái có màu; chế độ tối vẫn theo lựa chọn trong Settings. Home ưu tiên pipeline lỗi gần đây ở các project đã ghim và MR cần review, sau đó là project ghim và issue được giao. Thẻ Home/CI chỉ lấy 5 pipeline gần nhất mỗi project; danh sách MR/issue trên Home lấy trang đầu. Mở Inbox hoặc project để xem và tải thêm. Số liệu đang tải hiện dấu ba chấm, lỗi từng nguồn hiển thị riêng và có thể thử lại. Giao diện không thay đổi quyền hoặc các bước xác nhận thao tác GitLab.

## Kết nối GitLab

Mặc định GitLab.com; nhập Self-Managed HTTPS khi cần, giữ subpath/port. Thiết bị phải có VPN/CA tin cậy tương ứng. Không bỏ TLS validation.

- OAuth: tại GitLab User Settings → Applications, tạo ứng dụng **public/non-confidential**, redirect chính xác `gitlabmobile://oauth/callback`, scope `api` hoặc `read_api` + `read_user`. Nhập Application ID vào app. App dùng browser hệ thống, PKCE S256 và không dùng client secret.
- Nếu instance không chấp nhận public-client exchange, dùng PAT riêng do bạn tạo với scope phù hợp. PAT không tự refresh. Chế độ chỉ đọc trong app không thu hẹp scope của PAT trên server; tạo PAT chỉ đọc ở GitLab nếu muốn giới hạn thật.
- Account/instance được phân tách; access/refresh token nằm trong SecureStore với device-only accessibility. iOS reinstall marker giúp xóa credential Keychain còn sót; coverage thực tế vẫn cần kiểm thử.
- Sau khi refresh kết quả không rõ, app yêu cầu reconnect; không tự dùng lại old refresh token. Không gửi token trong chat, argv hoặc file public config.

## Lệnh ghi và CI

Issue/MR thao tác có xác nhận; GitLab quyết định quyền. CI mutation mặc định khóa vì policy trống. Import policy đã thử qua Settings; xem [policy guide](project-ci-policy.md).

Lệnh ghi không retry tự động. Khi timeout/process chết, metadata intent được giữ trong SecureStore, app chặn lệnh tiếp theo. Tải lại resource/kiểm tra GitLab rồi xác nhận “Đã kiểm tra kết quả” trong Settings. Đây không phải offline queue và app không replay.

## Log/artifact transport gate

Có streaming implementation dùng `expo/fetch`, manual redirect, cap trace 1 MiB và artifact 128 MiB ghi theo chunk ra cache. Native implementation có thể buffer trước khi JS nhận stream; unit tests không chứng minh được hard cap native.

Vì thế mặc định `EXPO_PUBLIC_BOUNDED_TRANSFERS_VERIFIED` không đặt; log/download bị khóa. Chỉ đặt `true` và rebuild sau khi PoC trên native runtime/thiết bị mục tiêu chứng minh:

- Oversized/chunked trace bị abort và memory budget đáp ứng; request vẫn abort khi background/lock/logout.
- Redirect fixture ở GitLab/API origin có thể đọc Location ở manual mode; CDN nhận **không Authorization/PRIVATE-TOKEN/cookie**. Return redirect về GitLab sau khi rời boundary cũng không được nhận lại credential.
- Binary ZIP checksum đúng, quota/expiry/cancel/share cleanup hoạt động; file không auto-open/unzip và không nằm trong user Documents/backup.

Nếu SDK/runtime không thể bảo đảm các điểm này, giữ khóa và dùng link GitLab. Cần native adapter với cap tại transport trước khi mở gate; không coi cắt text sau full download là memory bound.

## Push và kiểm chứng live

Push optional ở lần build này. `EXPO_PUBLIC_NOTIFICATION_SERVICE` chỉ được trỏ receiver HTTPS tin cậy của bạn. EAS project ID và APNs/FCM credentials mới bật remote push; xem [operations guide](notifications-operations.md). APNs entitlement sẽ được giữ khi có `EXPO_PUBLIC_EAS_PROJECT_ID`, nên cần signing tương ứng.

`pnpm test:contracts:read` cần `GITLAB_SANDBOX_URL`, `GITLAB_READ_ALLOWLIST` chứa exact URL và `GITLAB_SANDBOX_TOKEN` qua secure environment. Script chỉ GET user/projects/metadata, không thay đổi GitLab. Chưa có sandbox thì command trả exit 2 và ghi NOT RUN.

`pnpm test:e2e:native` cần Maestro và `MAESTRO_DEVICE`, chạy native connect smoke. Nếu dùng bundle ID riêng, cập nhật `appId` trong flow. Auth thật, CI write và push checks trong [verification matrix](verification-results.md) cần thiết bị/sandbox, không được thay bằng smoke test.
