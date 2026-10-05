# Phase 07 — Hardening, CI cho app và phát hành

- Status: pending. Priority: P1. Effort: 7 ngày công / 56h.
- Dependency: phases 01–06 cho bản đầy đủ. Auth/mutation/account-isolation/redirect/non-production-allowlist gates **bắt buộc** cho mốc nội bộ sau phase 04; không chờ cuối roadmap mới kiểm chứng safety.
- Mục tiêu: bản mobile được kiểm chứng trên native devices, không chỉ skeleton/screens/mock responses.

## Files dự kiến tạo/cập nhật

- Create `.gitlab-ci.yml`: pipeline build/test/lint/contract/security cho chính app này.
- Create `apps/mobile/eas.json`, `tests/e2e/`, `tests/contracts/`, `tests/security/`, `scripts/verify-plan-and-contracts.*` và root package-manager scripts tương ứng.
- Create `docs/release.md`, `docs/security.md`, `docs/support.md`, `docs/privacy.md`, `docs/verification-results.md`.
- Modify module tests, app config, target matrix/development guide dựa trên các lỗi thực tế.
- Native assets/app store metadata tạo sau khi chủ sản phẩm xác nhận app name/branding/distribution.

## Tasks

### CI kiểm chứng app

- [ ] GitLab pipeline stages: install/verify/unit/contract/build; pnpm frozen lockfile, cache key theo lockfile/toolchain; mobile/backend lint/typecheck/tests; reports JUnit/coverage.
- [x] Secret scan và dependency vulnerability check không in matching secret values; review scopes/public config/bundle. CI variables bảo vệ và masked, không echo credentials hoặc export toàn env.
- [ ] Native Android artifact build reproducible; iOS requires macOS runner/EAS strategy. Không hứa Linux GitLab runner tự build iOS được.
- [x] Fast unit/fixture checks tự động mỗi MR; read-only contract scheduled/opt-in với allowlisted sandbox. Live write tests không chạy tự động trên production hoặc mọi MR không tin cậy.
- [ ] Build distribution và store submission là manual/protected jobs; không publish/deploy hoặc push config vào GitLab account thật khi chỉ đang lập kế hoạch.

### Validation matrix

- [ ] Auth: wrong state/redirect, cold start, denied consent, lifetime từ server, parallel refresh, response-lost rotation, SecureStore-save fail, logout/switch race, reinstall, device migration, biometrics changed/canceled.
- [ ] Network: airplane mode, weak Wi-Fi/VPN, API timeout trước/sau dispatch, 401/403/404/409/429/5xx, process kill/resume, wrong TLS/host/subpath. Mutation không tự replay và offline không logout giả.
- [ ] CI: run branch/tag, rules/YAML reject, variable policies, failed/canceled retry khác successful redeploy, manual vs delayed, protected production, job ID mới, downstream project deny, nullable data, canceling và unknown status.
- [ ] MR: revision push race, approve SHA, inline diff position stale, server diff limits, SAML/approval password exception, merge policy deny.
- [ ] Artifact/log: byte cap memory trên real device, large binary stream/redirect/quota/checksum/expiry/cancel/share cleanup; auth headers không bị chuyển sang CDN/avatar/external URL.
- [ ] Schedules: timezone/DST, branch/tag cùng tên, owner/quyền khác nhau và play không đổi next run.
- [ ] Notification: spoof/duplicate/order/outbox recovery, event permission revoked, service-session refresh/logout/offline lease, DeviceNotRegistered, correct account routing và stale event.
- [ ] Role/tier matrix: Reporter/Developer/Maintainer, Free + Premium fixture và live coverage thực sự được cung cấp. Custom role/protected policy không suy diễn từ integer.
- [ ] iOS/Android accessibility, font scaling, dark mode, keyboard/safe areas, target touch sizes, screen readers và privacy screen khi background.

### Measurement và vận hành

- [ ] Đo Home shell/preferences P95 ≤2s, first page data P95 ≤3s theo device/network thống nhất phase 01; báo API latency riêng. Refresh silent và không browser trong happy path expired access token.
- [ ] Measure JS/native memory, render responsiveness, network bytes và battery khi xem CI/log; background polling dừng. Không đạt budget thì giảm page/buffer/poll theo đo đạc, không đổi metric để làm báo cáo đẹp.
- [ ] Soak phiên thực tế ít nhất 7 ngày trên sandbox và fake-clock 30 ngày; phân biệt 2 loại bằng chứng. Grant revoked vẫn reconnect đúng, không cam kết login vô thời hạn.
- [ ] Release build signed, secure backup/no untrusted OTA capability changes, versioned schema migration, emergency disable risky feature/download nếu cần. OTA/native update policy phải tuân thủ store và không dùng để bypass review.
- [x] Privacy disclosure: credentials trên thiết bị, generic push metadata/retention ở service, user revoke/unlink/delete instructions; crash/telemetry disabled mặc định hoặc opt-in có scrub được test.
- [ ] Recheck Apple/Google SDK/submission rules và Expo toolchain hiện hành lúc release; không dùng deadline cũ trong kế hoạch làm căn cứ.
- [ ] Internal Android → TestFlight/internal iOS → user acceptance → production opt-in. Store account/hosting/signing/domain budget thuộc owner quyết định; không tự mua hoặc deploy.
- [ ] Incident playbook: revoke application/user grant, disable push registration, rotate webhook/app-service keys, kill risky feature, clear cache/device data; không xóa data hoặc pipeline của user để chữa lỗi.

## Acceptance / exit gate

1. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm test:unit`, `pnpm test:contracts:fixtures`, `pnpm test:security`, `pnpm test:e2e:native` là scripts được khai báo thật và đều pass trên revision phát hành; live tests báo target/version/time riêng.
2. Native **signed release candidate**, không chỉ development build, đã kiểm chứng trên ít nhất một thiết bị thật mỗi OS cho auth/callback/lock/trace/download/push/cold-start và production network-security config. Thiếu coverage là blocker phát hành tương ứng; dev-only evidence không đủ cho release gate.
3. Không critical/high unresolved security issue; không credential trong bundle/log/storage thường/backup/redirect/request telemetry.
4. Core E2E qua: reconnect-free ordinary open, pipeline failure → log → retry, run pipeline, manual deploy staging, MR comment/approve, schedule play, push open đúng account.
5. Risky mutation không double send; permission/version unsupported có lý do; production/rollback policy được chủ project chấp thuận và thử ở non-production.
6. Verification-results có bảng passed/failed/not-run và bằng chứng measurement, không dùng planned test như kết quả thực thi.
7. Người dùng chấp thuận distribution/deploy thật; app/server release guide và rollback **bản app/service** rõ ràng, khác rollback hệ thống mà CI của user triển khai.

## Failure protocol

Fix targeted blocker rồi rerun nearest test và toàn bộ affected contract. Không publish nếu còn crash/auth leak/production action thiếu gate, failed native build hoặc chưa có device coverage được yêu cầu. Thiếu tài khoản/license/hardware chỉ ghi blocker + hành động owner cần làm; không tự bỏ gate để hoàn tất plan.

## Execution evidence — 2026-10-04

GitLab CI verify/integration/iOS JS bundle, secret scan, dev/security/privacy/release docs và native smoke runner đã có. Final type/lint/unit/Doctor/bundle pass.

Audit fail với 2 high upstream; chưa signed RC/device E2E/live matrix/performance/7-day soak. Store publish thuộc giai đoạn khác.

Checkbox đã đánh dấu ghi nhận task source-level, không chứng nhận acceptance/native/live của toàn phase. Dòng Status ở đầu là snapshot ban đầu; overall plan vẫn in-progress. [Final report](../reports/implementation-261004-1903-current-plan.md) chứa coverage và questions/assumptions; [verification](../../docs/verification-results.md) ghi check thực tế.
