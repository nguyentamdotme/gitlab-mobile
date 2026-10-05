# Notification service operations

Service source đã có receiver/outbox/worker và integration bằng PostgreSQL disposable; chưa deploy hoặc nhận push thật. Mobile gọi GitLab trực tiếp và không cần service để login/xem/thao tác API.

## Cấu hình operator

Operator provision PostgreSQL, HTTPS reverse proxy/domain, network egress allowlist và Expo/APNs/FCM credentials. Không tự đăng ký/mua/deploy các dịch vụ này. Backend Node 24, Fastify 5, PostgreSQL 17 cho integration; pool mặc định 10 connections.

Các biến runtime backend chỉ cấp qua secret manager/process environment, không argv/repo/mobile public config:

- `DATABASE_URL`: database connection. Không log connection URL.
- `WEBHOOK_ENCRYPTION_KEY`: 32 bytes base64, mã hóa AES-256-GCM webhook key; backup key qua secret manager riêng. Mất key cần đăng ký/rotate lại hooks.
- `TRUSTED_INSTANCES`: JSON array `{id, baseUrl, allowPrivate}` do operator quản lý. HTTPS/subpath chính xác, không arbitrary client URLs. `allowPrivate` mặc định false; private instance cần explicit network policy. DNS address filter/pinning trong code không thay outbound firewall.
- `HOST`, `PORT`: mặc định `127.0.0.1:3001`, expose qua HTTPS proxy. Giữ proxy request-body/header/access logging redacted; code Fastify không log payload.
- `EXPO_ACCESS_TOKEN`: optional Expo Push enhanced security token.
- `BACKUP_DIRECTORY`: đường dẫn backup bảo mật cho migration/registration; mặc định `backups` bị gitignore.

```bash
pnpm install --frozen-lockfile
pnpm --filter notification-service db:migrate
pnpm --filter notification-service start
pnpm --filter notification-service worker
```

Migration cần `pg_dump` trên host và backup thành công trước bất kỳ schema change. Script dùng migration ledger/transaction/advisory lock, chạy lại không apply migration trùng. Kiểm tra backup và phương án restore trên DB disposable; không chạy migration vào DB production khi chưa có authorization riêng. Registration script cũng backup trước thay đổi data.

Start/worker cần service manager theo dõi PID/restart và shutdown SIGTERM. Kiểm tra owner port 3001 trước khi start, không tạo duplicate worker/server cho cùng task. `/health` process health; `/ready` kiểm tra DB. Worker chạy vòng 1s, claim một outbox row bằng `FOR UPDATE SKIP LOCKED`, lock TTL 60s, bounded retry tối đa 8 lần/dead state, receipt theo ticket ID. Monitor DB outbox state/count/age mà không log event content hoặc secrets.

## Project webhook registration

Maintainer/Owner tạo hook trong GitLab Settings → Webhooks. Receiver operator chạy `pnpm --filter notification-service exec tsx scripts/register-hook.ts` với các biến qua secure runtime:

- `HOOK_INSTANCE_ID`: một ID trong trusted registry.
- `HOOK_PROJECT_ID`: numeric project ID thật.
- `HOOK_MODE`: `signed` cho Standard Webhooks trên instance hỗ trợ, hoặc `legacy` cho baseline cũ.
- `HOOK_SECRET`: signing token `whsec_...` hoặc shared secret mạnh ≥32 ký tự. Không gửi trong chat/log/argv.

Script chỉ đăng ký receiver DB, in registration ID/path, không ghi GitLab API. Nhập endpoint HTTPS `/v1/webhooks/<registration-id>` và key vào GitLab; chọn pipeline/job/deployment/MR/note events, giữ SSL verification bật. Key không đi vào mobile.

Signed mode kiểm chứng `webhook-id.webhook-timestamp.raw-body`, HMAC-SHA256 với key base64 sau prefix `whsec_`, timestamp ±5 phút và constant-time signature compare. Contract từ [GitLab Standard Webhooks](https://docs.gitlab.com/user/project/integrations/webhooks/#signing-tokens); không fallback sang shared token khi signed registration thiếu signature. Legacy `X-Gitlab-Token` là shared-secret compare, không phải payload HMAC.

Receiver xác minh registration/project, validate IDs và normalize metadata; transaction ghi event/outbox, trả 202 nhanh. UUID delivery hoặc fallback identity hash được dedup; raw content không lưu. Deployment payload dùng `deployment_id` theo API thật, không giả định có `environment_id`. Event route không được tin như trạng thái mới nhất.

## Mobile và trust boundaries

Đặt `EXPO_PUBLIC_NOTIFICATION_SERVICE` thành HTTPS receiver do bạn vận hành và `EXPO_PUBLIC_EAS_PROJECT_ID` thành project đã provision push. Các giá trị này public; không chứa secret. Rebuild native sau thay đổi capability. Mặc định không có 2 giá trị này, nên local iPhone qua cáp không cần APNs entitlement.

Settings → Thông báo: user consent trước OS permission; backend xác minh `/user`, cấp device-bound service session (access 15 phút, absolute lifetime 30 ngày) và chỉ lưu hash credentials. Push address không là credential. Watch project cần registration đã có; create/renew/resolve đều gọi GitLab bằng token transient hiện tại để xác minh lại user/project. Lease 24h; app mở foreground/online sẽ gia hạn subscriptions của phiên đang active. Khi service session refresh mất kết quả, reconnect service để tạo phiên mới, không replay old refresh token.

Generic payload chỉ có eventId/accountRef. Cold/warm notification tap phải thuộc active service session và GitLab account, reverify quyền rồi đọc resource trực tiếp; không chạy CI action từ push. Subscriptions từ account khác không được tự chuyển vào active account. Unwatch và xóa dữ liệu của phiên hiện tại nằm trong Settings.

Logout queue dùng cleanup-only handle cho `/v1/session/cleanup`: chỉ revoke, không đọc data. Khi offline, worker có thể còn generic delivery tới lúc lease hết; OS queue có thể deliver trễ sau revoke. Worker kiểm tra active ownership/lease/preferences/TTL cho send/retry; receipt `DeviceNotRegistered` tắt device. Không hứa exactly-once hoặc thu hồi push đã ở APNs/FCM queue. Project events coalesce trong cửa sổ 30s; quiet hours dùng phút UTC, range qua nửa đêm được hỗ trợ.

Metadata events và outbox giữ 7 ngày; sessions hết hạn được purge. Disable registration qua operator DB change có backup trước sẽ ngừng route/push mới; không xóa GitLab resources. Rotate encryption/signing/Expo key theo incident policy, không ghi key vào ticket.

## Validation

```bash
pnpm --filter notification-service test
pnpm --filter notification-service typecheck
pnpm --filter notification-service lint
pnpm test:notifications:integration
```

Integration dùng Docker PostgreSQL thật, backup trước migration, Fastify inject và synthetic GitLab verifier/PushGateway; không gọi tài khoản GitLab hoặc Expo Push thật. Kiểm tra forged/project mismatch/dedup/permission revoked/lease expiry/refresh rotation/cleanup owner. TLS deployment, real webhook, APNs delivery, native tap/reinstall và operator egress vẫn cần live sandbox riêng.
