# Phase 06 — Background notifications qua webhook

- Status: pending. Priority: P2. Effort: 7 ngày công / 56h.
- Dependency: phase 02 + 04; integration routes hoàn chỉnh sau phase 05.
- Mục tiêu: nhận cảnh báo khi app đóng mà không chạy polling liên tục hoặc giữ GitLab token trên backend.
- Mobile core hoạt động độc lập; phần này thuộc bản đầy đủ nhưng cần domain/hosting/project webhook permissions và FCM/APNs provisioning.

## Files dự kiến tạo

- `apps/notification-service/src/server.ts`, `routes/session.ts`, `routes/devices.ts`, `routes/subscriptions.ts`, `routes/events.ts`, `routes/webhooks.ts`.
- `apps/notification-service/src/gitlab-verification.ts`, `trusted-instance.ts`, `webhook-auth.ts`, `event-normalizer.ts`, `push-worker.ts`, `session-store.ts`.
- `apps/notification-service/db/migrations/`: device sessions, subscriptions, webhook registrations, dedup events và transactional outbox.
- `apps/notification-service/src/__tests__/`: authentication/SSRF/authorization/dedup/receipts/permissions tests.
- `apps/mobile/src/features/notifications/register.ts`, `api.ts`, `routes.ts`, `screens/`; `apps/mobile/app/settings/notifications.tsx`.
- `docs/notifications-operations.md`, `docs/privacy.md`, `tests/e2e/push-routing.yaml`.

## Kiến trúc và trust boundaries

Backend Fastify/TypeScript + PostgreSQL. Không giữ GitLab access/refresh token lâu dài, không proxy CI mutation, không ingest full source/trace/artifacts. Secrets backend (webhook keys, app-session signing, Expo Push credentials nếu dùng) ở secret manager; không nằm repo/mobile.

1. User chọn watch project trong app, giải thích cần backend và người có quyền cấu hình webhook.
2. App gửi GitLab access token hiện tại **chỉ tới receiver do ứng dụng tin cậy**, qua TLS/auth payload không được log. Backend gọi GitLab `/user` và `/projects/:id` để xác minh instance/user/project; không tin userId/project quyền do client tự khai.
3. Cấp app-service session riêng cho thiết bị/account: access ngắn hạn, rotating refresh với thời hạn tuyệt đối dự kiến 30 ngày, hash refresh ở DB. Session không mang quyền GitLab và không đủ để nhận nội dung event nếu không revalidate GitLab.
4. Subscription lease mặc định 24h, chỉ gia hạn khi đã xác minh lại quyền GitLab. App mở lại thì revalidate; lease hết hạn không còn push. Đổi lại có thể phải mở app định kỳ để tiếp tục nhận thông báo; không hứa alert dài ngày vô hạn khi backend không giữ GitLab credentials.
5. Maintainer/Owner đăng ký hook qua thao tác có xác nhận hoặc hướng dẫn setup; URL receiver HTTPS + project-specific secret/signing key, chọn pipeline/job/deployment/MR/note events theo cấu hình.
6. Receiver xác thực event, match registration/project/instance, dedup; transaction ghi metadata tối thiểu/outbox rồi trả nhanh. Worker xử lý push/receipts/retry.
7. Push mặc định: “Có cập nhật cần kiểm tra” + opaque event ID/account reference, **không tên project/ref/status/log/comment/secret**. Event webhook là tín hiệu, không là bằng chứng quyền hoặc trạng thái mới nhất.
8. Chạm push → app lock/restore token → resolve opaque event bằng GitLab token hiện tại → backend xác minh lại `/user`/project trước trả route metadata → app đọc resource trực tiếp GitLab. Không hiển thị cache private cũ nếu user mất quyền.

Một user mất project permission có thể vẫn nhận generic ping cho tới lease hết hạn; nội dung không nhạy cảm và event route không được resolve nếu không còn quyền. Lease và generic payload là giới hạn đã công bố, **không phải authorization revocation tức thời**. Nếu tổ chức cấm cả tín hiệu hoạt động sau mất quyền, cần đổi sang per-delivery permission verification với credential server-managed, được phê duyệt riêng; không âm thầm thêm token vault.

## Tasks

- [ ] Receiver chỉ hỗ trợ instance registry allowlisted do operator quản lý; arbitrary self-managed URLs không được backend fetch. Validate origin + base path và egress allowlist chống SSRF, block cloud metadata/loopback/private ranges trừ private instance đã quản trị explicit; chống redirect escape/DNS rebinding bằng network controls.
- [ ] Verify user/project mỗi create/renew/resolve subscription; session bound instance + numeric user + device, chống IDOR/cross-account/subscription tampering. GitLab token transient không log body/header và không lưu DB.
- [ ] App-service session TTL/rotation/revocation/rate limits; push address không là auth credential. DeviceNotRegistered deactivate token; update push token trên reinstall và rotation.
- [ ] Project hook registration riêng và matching project ID; quản lý webhook cần admin/Maintainer/Owner. Developer dùng app vẫn vận hành CI dù không tự bật push được.
- [ ] Legacy `X-Gitlab-Token`: constant-time secret compare qua HTTPS, lưu secret mã hóa at rest; đây không phải HMAC payload. Instance hỗ trợ `signing_token` (19.0+, flag/GA theo version) ưu tiên HMAC verifier theo official algorithm/raw body/timestamp, không tự đoán canonicalization.
- [ ] Validate schema/body size/rate/timestamp khi có signature; mismatch project/registration reject. Dedupe event UUID hoặc stable event identity theo loại event; duplicate/out-of-order không tạo spam hoặc đổi state ngược.
- [ ] Không log webhook secret/payload; lưu normalized IDs/event type/time, bỏ commit message/comment/body/variables. Metadata event giữ mặc định 7 ngày; outbox processed purge theo retention; credentials/hash giữ tới revoke/expiry policy.
- [ ] Preferences project/event/quiet hours; coalesce events để tránh pipeline và mọi job đều spam; retry Expo Push có backoff, theo ticket/receipt kết quả chứ không chỉ HTTP 200.
- [ ] Async receiver nhận event → transaction outbox → reply; worker retry lỗi transient, dead-letter bounded và ops health/readiness. Trước **mỗi lần gửi/retry**, kiểm tra lại subscription/session/device active, owner/account mapping, lease chưa hết, preferences/quiet hours và event TTL; expired/revoked rows bị drop, không gửi lại vì đã enqueue trước đó. Không thêm Redis trước khi có bằng chứng cần.
- [ ] Push đã được APNs/FCM chấp nhận không thể bảo đảm thu hồi khỏi OS queue; logout/lease expiry có thể còn generic ping trễ. Payload luôn opaque, app không resolve/hiển thị private data nếu session hoặc quyền không còn hợp lệ. Ghi giới hạn này trong UX/privacy thay vì hứa không bao giờ có thông báo muộn.
- [ ] Logout online revoke device service session/subscriptions; offline logout xóa local data, không thể ngay lập tức xóa subscription ở server. Dùng unsubscribe handle không cấp quyền đọc/ghi, giữ riêng trong secure cleanup queue để gửi khi app online lại; lease cuối cùng vẫn chặn stale delivery. Queue cleanup này không phải offline CI mutation queue.
- [ ] Native push deep link cold/warm/background, wrong account/expired event/deleted project/logout state; không chạy approve/deploy từ notification action.
- [ ] Expose privacy/disable push/delete service data; backend outage không chặn direct GitLab login/API. GitLab private instance không reachable verification/webhook thì thông báo feature unavailable.

## Acceptance criteria và test gate

- Forged/malformed/incorrect secret/signature/project mismatch → reject, không push. Duplicate event delivery chỉ một logical notification; outbox không mất event khi worker restart.
- Service session không cho đăng ký project khác user, resolve event chỉ sau reverify quyền; revoked GitLab permission không làm lộ project detail trong push/resolve.
- Service DB/log không có GitLab tokens/source/log/artifact/comment contents; webhook secret bảo vệ riêng. Signed verifier tuân thủ version-specific contract.
- Real Android + iOS nhận push trên release/development builds khi app background/terminated theo OS delivery behavior. Không cam kết SLA tuyệt đối cho APNs/FCM, force-stop, Focus mode hay OS battery policies.
- Offline logout có residual-delivery policy/lease minh bạch; worker không gửi mới/retry khi subscription hết hạn hoặc revoked, kể cả event đã ở outbox. Push đã gửi cho OS có thể đến trễ nhưng không lộ nội dung/resolve được sau mất quyền. Không có bypass dựa vào account ID trong deep link.

Scripts **sẽ tạo**: `pnpm --filter notification-service test`, `pnpm --filter notification-service typecheck`, `pnpm --filter notification-service lint`, `pnpm --filter mobile test:notifications`, `pnpm test:notifications:integration`. Integration dùng DB/container disposable, not production; FCM/APNs/Expo push sandbox được provision và chấp thuận trước.

## Failure protocol

Thiếu hosting/domain/Maintainer hoặc network reachability thì backend push là blocked, không hứa mobile-only background notifications đáng tin cậy. Gate phiên bản/tier ký webhook cần fixture và live test; không coi header event name là xác thực. Deploy thực tế yêu cầu opt-in riêng.
