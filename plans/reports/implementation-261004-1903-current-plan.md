# Implementation report — current GitLab Mobile plan

Ngày thực thi: 2026-10-04 UTC. Workspace: repository `gitlab-mobile`, branch `main`. Đây là báo cáo trạng thái, không phải chứng nhận release hoặc tài liệu authority cho hành vi runtime.

## Kết quả và phạm vi được giao

Người dùng yêu cầu `$ak-cook` implement plan hiện tại, bỏ human-gate, tự chọn câu trả lời phù hợp dự án và ghi toàn bộ questions/assumed answers. Người dùng tự build/run trên iPhone qua cáp; Apple Developer publishing là giai đoạn khác. Yêu cầu bổ sung: `$ak:docs init`, `agent-context`, hướng dẫn start/build máy local và deploy app lên iPhone.

Đã tạo workspace Expo/React Native/TypeScript, source cho luồng GitLab native và notification service Fastify/PostgreSQL, scripts/CI/checks cùng tài liệu dự án. Không commit/push, không đăng ký OAuth/webhook thật, không thay đổi tài nguyên GitLab, không deploy backend hoặc publish store. Plan giữ **in-progress** vì acceptance còn native/live/security evidence chưa đạt. Checkboxes source-level không phải tỷ lệ acceptance hoặc chứng minh tất cả phase hoàn thành.

## Source đã triển khai theo phase

| Phase | Owner thực tế / phần đã có | Phần còn mở |
|---|---|---|
| Foundation | Workspace manifests/lockfile; `apps/mobile/app.config.ts`, `src/app`, `packages/contracts`; frozen install, SDK checks, strict TS/lint/Jest, iOS CNG và JS export | Signed development build/device, public-client OAuth live, target sandbox và native transport PoC |
| Auth/session | `src/core/auth`, `src/core/security`, Query provider: OAuth PKCE/PAT, exact callback/TTL, token rotation/save markers, single-flight, account isolation, lock, restore/switch/logout/revoke best effort | Callback warm/cold/SSO thật, biometrics/reinstall/backup/device migration; real 7-day/30-day session evidence |
| Workspace/issues | `features/gitlab-api.ts`, Home/Inbox, project/repository routes, issue detail/forms, HTTP/pagination/Query lifecycle/preferences | Device journeys, role/server-policy live, native accessibility và latency measurements |
| CI core | `features/pipelines/ci-detail.tsx`, `features/jobs/transfers.ts`, mutation journal/runner, action policy: pipeline/jobs/stages/bridges/run/retry/cancel/manual, bounded stream/redirect logic | Log/artifact **khóa mặc định** tới native byte-bound/redirect PoC; CI writes **khóa mặc định** tới owner-verified policy; device memory/checksum/quota và actual CI journeys |
| MR/advanced CI | MR revisions/files/discussions/inline comments/approve/merge guards; environments/deployments/approval/stop/redeploy/rollback mapping; schedules CRUD/play/ownership/inputs; JUnit/CI lint | Live tier/role/protected environment, sandbox rollback và schedule timezone/DST/device tests |
| Notifications | `apps/notification-service`: trusted-instance verification, signed/legacy hook, service sessions/device/subscriptions/event resolver, PostgreSQL transaction/outbox/Expo receipts/retention; mobile setup/listener/routes/cleanup | Receiver hosting/TLS/egress controls, live hooks, APNs/FCM provisioning, real cold/warm/background push |
| Hardening/docs | Root scripts, `.gitlab-ci.yml`, secret scan, Maestro connect smoke runner, security/privacy/release/verification docs, docs init/agent context và iPhone guide | Audit high findings, actual GitLab CI execution, signed RC/device E2E, broad native journeys/performance/soak; store publication ở giai đoạn sau |

Tên file trong plan là thiết kế ban đầu, không là inventory bắt buộc. Module được gộp theo boundary để tránh các abstraction chỉ chứa wrapper: PAT/OAuth tại `oauth.ts`; account registry tại credential store; query lifecycle/provider dùng chung; resource API/forms/routes dùng chung; backend routes trong `server.ts`. Route root theo scaffold SDK là **`apps/mobile/src/app`**, thay cho đường dẫn `apps/mobile/app` trong bản plan ban đầu. Native CNG output không được commit.

Native E2E runner hiện có **connect smoke**, không giả lập toàn bộ auth/CI/MR/push journeys bằng fixtures. Các journeys đó vẫn là checklist thiết bị cần thực hiện. Unit coverage hiện tại tập trung auth/network/DTO/mutation/policy/transport/routing; không tuyên bố toàn UI đã được integration/E2E-test.

## Questions và assumed answers

Không hỏi lại human-gate. Những câu dưới đây là các quyết định đã gặp khi thực thi; “giả định” không là xác nhận live hoặc cấp quyền production.

| # | Question / quyết định cần câu trả lời | Answer đã chọn và lý do |
|---|---|---|
| 1 | Implement phần nào của plan? | Giữ full feature scope source cho 7 phases; không có `--yagni`. Native/live acceptance chưa có điều kiện thì ghi riêng, không fake pass. |
| 2 | Ưu tiên Android hay iOS? | **Quyết định người dùng:** iPhone qua cáp trước. Giữ source Android, chưa claim native Android verified. |
| 3 | Publish Apple Developer/TestFlight ngay không? | **Quyết định người dùng:** để giai đoạn khác. Local device signing vẫn cần Xcode/Apple Account của người dùng. |
| 4 | Bỏ human-gate có bỏ safety gate không? | Bỏ phỏng vấn/approval implementation thường lệ. Không bỏ native evidence, TLS, server permission, CI policy hoặc security gates. |
| 5 | Toolchain nào? | Expo stable SDK 57 từ official docs/CLI, Node 24, pnpm 12; SDK install/Doctor và lockfile xác minh compatibility. Không dùng version từ trí nhớ. |
| 6 | Dependency version/peer conflict xử lý thế nào? | Pin TS 6.0 và ESLint 9 phù hợp ecosystem, `test-renderer` 1.2.0 tương thích React 19.2; manifests/lockfile qua package manager. Không patch dependency để giả audit pass. |
| 7 | App name, ID và branding? | `GitLab Mobile`, `org.tani.gitlabmobile` cho dev; iOS bundle ID có public env override khi owner cần ID riêng. Branding/store metadata chưa chốt cho publication. |
| 8 | GitLab instance/version thấp nhất? | GitLab.com mặc định; Self-Managed HTTPS giữ port/subpath, baseline **dự kiến** 17.0+. Chưa có instance thật để chứng minh baseline. |
| 9 | OAuth client/secret/scope lấy từ đâu? | Owner nhập public Application ID theo instance, PKCE S256 không secret. Interactive `api`, read-only `read_api` + `read_user`; chưa tự đăng ký application khi thiếu quyền/account. |
| 10 | Nếu OAuth public client chưa sẵn có? | PAT do user tạo và nhập vào secure UI; không thu password, không pretend PAT refresh, không thu hồi PAT dùng nơi khác khi unlink. |
| 11 | Callback dev/production domain nào? | Exact dev scheme `gitlabmobile://oauth/callback`. Không invent HTTPS/Universal Link domain; production association sẽ cần domain owner và native validation. |
| 12 | UI ngôn ngữ/theme/navigation? | Tiếng Việt, 5 tabs theo plan, system/light/dark; native controls. Chưa thêm toàn bộ English translation hoặc brand assets vì chưa có yêu cầu nội dung. |
| 13 | Multiple accounts/cache? | Nhiều account nhưng một active session, namespace instance + user ID; private content/draft trong RAM, cancel/reset/remount khi switch/logout/background. |
| 14 | Lock/step-up mặc định? | Local lock opt-in, 5 phút background khi bật; production policy yêu cầu OS biometric/device authentication. Không tự tạo PIN vault hoặc bypass GitLab approval. |
| 15 | SecureStore authentication và backup? | Device-only OS secure storage; không `requireAuthentication` mỗi refresh mặc định vì chưa native PoC. Android backup tắt; first-install marker xóa credential/service/intent còn sót cho account registry. |
| 16 | Mất mạng sau write thì retry thế nào? | Không auto resend/offline write queue. Metadata-only secure intent trước dispatch, outcome unknown giữ journal và user kiểm tra/acknowledge; không persist bodies/variables/token. |
| 17 | Bound dữ liệu/query? | Default page 30, pins tối đa 8, Home fan-out có giới hạn, JSON cap 4 MiB, repository text cap 256 KiB; là development bounds, chưa performance proof trên device. |
| 18 | Trace/artifact có mở ngay không? | Source stream/trace UI có; trace cap 1 MiB, artifact quota 128 MiB. Flag mặc định **false** tới native PoC, vì JS cap không chứng minh native không buffer hoặc leak bearer qua redirect. |
| 19 | CI project/ref/environment nào được chạy? | Không invent staging/production mapping. Policy mặc định rỗng; owner import đúng instance/project/ref/environment và xác nhận đã thử. Confirmation dialog không tự phân loại job. |
| 20 | Variables/inputs cho run pipeline/schedule? | Variables keys allowlist theo policy; inputs chỉ version ≥18.1 và policy/config enabled. Không thay inputs bằng variables để giả semantics giống nhau. Values không lưu history. |
| 21 | Redeploy/rollback là thao tác generic không? | Chỉ mapping đã được owner kiểm chứng; retry deployment job có artifacts còn usable hoặc pipeline rollback inputs chuyên dụng. Không rollback database/hạ tầng bằng endpoint chung. |
| 22 | MR approval cần password/SAML? | Disabled native approve khi configured policy yêu cầu reauth; safe link GitLab để xử lý. Không thu password native, không auto-merge/bypass checks. |
| 23 | Schedule timezone/ref nhập thế nào? | UTC mặc định, IANA timezone và 5-field cron validated; branch/tag selected từ API với qualified refs, stale owner/ref/state recheck. |
| 24 | Backend stack/Redis/token custody? | Fastify + PostgreSQL transactional outbox; chưa Redis. GitLab token transient cho read verification, không DB/log/token vault, không proxy CI writes. |
| 25 | Receiver có fetch mọi Self-Managed URL không? | Chỉ operator-allowlisted HTTPS instance registry; DNS filtering/pinning, không redirects. Private range cần explicit registry/network control, metadata/loopback luôn reject. |
| 26 | Service token/lease/retention mặc định? | Access 15 phút, absolute session 30 ngày, project lease 24h, event TTL 7 ngày. Đây là conservative operational trade-off để không giữ GitLab credentials lâu dài. |
| 27 | Push chứa gì, quiet/coalesce thế nào? | Generic message + opaque event/account IDs; coalesce 30s, quiet hours theo UTC. Revalidate GitLab khi mở event, không execute approve/deploy từ push. |
| 28 | Offline logout/revoked permission có hết push tức thì? | Không hứa thu hồi OS queue. Secure cleanup-only queue tối đa 8 handles và lease giới hạn residual delivery; resolve private data bị reverify/reject khi mất quyền. |
| 29 | Signed webhook/legacy chọn gì? | Signed Standard Webhooks theo official HMAC/raw-body/id/timestamp algorithm khi instance/operator hỗ trợ; legacy shared token explicit cho instance cũ. Signed registration không downgrade fallback. |
| 30 | Hosting/domain/APNs/FCM có sẵn không? | Không có evidence hoặc provisioning được cung cấp. Service source và setup guide có, deploy/provision chưa chạy; mobile core vẫn hoạt động khi push optional chưa bật. |
| 31 | Local build có cần paid/cloud build không? | Dùng Mac/Xcode và device qua cáp; mặc định không APNs entitlement cho Personal Team. Không tự mua Apple membership/EAS/cloud. Release local thử không Metro không đồng nghĩa distribution. |
| 32 | Tests nào là bằng chứng thật? | Jest và backend unit synthetic ở boundary phù hợp; PostgreSQL integration dùng container thật disposable. Missing live/device credentials trả NOT RUN, không mock thành live success. |
| 33 | Audit high chưa patch xử lý gì? | Ghi **FAIL**, giữ CI/release gate. Có 2 high upstream; metadata audit còn ghi 2 moderate. Không suppression, không claim security clean. |
| 34 | Telemetry/crash collector? | Không bật mặc định, không lưu token/log/body vào analytics. Bug report phải scrub secret. |
| 35 | Có commit/push/deploy? | Chưa được yêu cầu, giữ working tree reviewable. Không gửi message/issue hoặc ghi ứng dụng ngoài repo. |
| 36 | Docs init chọn classic layout không? | Reuse docs hiện tại, thêm index + architecture rationale; không classic preset/placeholder/governance mới. Tách stateful report khỏi evergreen docs. |
| 37 | Agent-context đặt ở đâu, cho ai? | Root `AGENTS.md` cho coding agents theo yêu cầu explicit; ngắn, imperative, chỉ các invariant/gotchas có evidence, link docs owner. Không thêm runtime hooks/settings enforcement. |
| 38 | Hướng dẫn start/build/deploy iPhone owner nào? | `docs/iphone-local-build.md` duy nhất cho Mac/Xcode, CLI/Metro, Personal Team, Debug/Release, trust/signing/device troubleshooting. `development.md` link tới đó. |

Không có secret/token/device personal identifier nào được giữ trong bảng. Source/tests dùng credentials synthetic chỉ ở test fixtures.

## Verification đã chạy

Final revision checks sau fixes và simplification, UTC khoảng 20:06–20:22:

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm verify` | PASS: strict TS/lint toàn workspace, **83 mobile tests + 21 backend tests** |
| PostgreSQL disposable integration | PASS: **10 tests**, PostgreSQL 17 thật, backup trước migration; container stop sau test |
| Mobile notification/transport targeted regression | PASS: 8 tests gồm late secure-write/logout và CDN return redirect không restore bearer |
| Expo dependency check / peer check | PASS, versions phù hợp SDK / không peer issue |
| Expo Doctor | PASS: **21/21** |
| `pnpm --filter mobile bundle:ios` | PASS: Hermes iOS JS export, 3,523 modules, bundle khoảng 6.2 MB; không IPA |
| iOS prebuild/CNG | PASS trên Linux với no-install; default generated entitlements `{}`; không Xcode build/pods/sign |
| Secret pattern scan | PASS với matching values suppressed; không thay full secret audit |
| `pnpm audit --prod --audit-level high` | **FAIL**: 2 high, chưa patched upstream; không sửa gate để qua |
| `pnpm test:contracts:read`, `pnpm test:e2e:native` | Exit 2 / **NOT RUN**, fail explicit khi thiếu sandbox hoặc device; không fake pass |
| Native signed/iPhone/Android builds, live GitLab auth/write, actual push, performance/real soak | **NOT RUN** |

Unit checks kiểm chứng refresh single-flight 20 callers, delayed logout/switch/save failures, rotation uncertainty, URL/pagination boundary, GET/write retry semantics, journal/no replay/double-tap, DTO null/unknown/version gates, MR SHA guard, stream cap và notification account validation. DB tests kiểm chứng service authorization/device binding/session refresh, webhook authentication/project matching/dedup, lease/revocation/preferences/quiet delivery/receipts. Các test này không chứng minh đầy đủ UI/native/tier/version matrix.

Audit high: [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Toolchain transitive exposure không được coi là không có risk chỉ vì app không trực tiếp gọi API bị ảnh hưởng. Xem [security](../../docs/security.md).

## Review, failures và corrections

- HTTP JSON/page parsing được thêm epoch/cancel guard **sau** đọc body, tránh response stream cũ cập nhật account mới.
- Refresh có marker bền vững trước network, phục hồi process death thành outcome unknown thay vì replay old refresh token.
- Mutation policy/stale preflight rejection giải phóng journal khi xác định chưa dispatch; timeout/network ambiguity vẫn giữ intent.
- Raw encoded dot-path kiểm tra trước URL normalization vì parser có thể xóa traversal evidence.
- Mobile service writes/cleanup được serialize và generation-guard; deterministic test chứng minh late secure write không hồi sinh credential sau logout. Notification import async kiểm tra active trước gắn listener; dependencies không lấy account object thay đổi mỗi render.
- Artifact redirect helper chỉ gửi bearer trong trusted API boundary và không restore credential sau khi đã ra CDN; regression test kiểm chứng return redirect. Native gate vẫn đóng.
- Default iOS APNs entitlement phát hiện được từ generated CNG; local-signing plugin bỏ entitlement khi không provision EAS project ID, phục vụ cable/Personal Team flow.
- PostgreSQL runner readiness chuyển sang TCP `pg_isready`, tránh socket-ready ở temporary init server rồi shutdown. Failures trước đó surfaced, sau sửa actual DB integration 10 pass; không test DB giả để thay thế.
- Backup chỉ báo thành công sau cả child exit và output file finish. Unknown instance lỗi 400 được sửa theo negative integration evidence.
- UI query/ref-picker simplification được delegate với ownership riêng; xem [simplifier report](code-simplifier-261004-1952-ui-queries.md). Final toàn workspace type/lint/unit/bundle đã chạy lại. Risk review auth/network/notification/service thực hiện inline; không claim independent audit toàn codebase.
- `ak-docs init` dùng docs-manager ownership chỉ docs index/architecture; controller tạo agent context/iPhone guide và kiểm chứng routes. Không external publishing.

## Docs và handoff

Điểm vào: [docs index](../../docs/README.md), [agent context](../../AGENTS.md), [start/build/cài iPhone](../../docs/iphone-local-build.md), [development](../../docs/development.md), [CI policy](../../docs/project-ci-policy.md), [notification operations](../../docs/notifications-operations.md), [release](../../docs/release.md).

Trên Mac tại repo root: frozen install rồi `pnpm --filter mobile ios`. Người dùng chọn iPhone/team; Xcode fallback và Release local có trong guide. Không cần notification backend hoặc APNs để thử direct API. Đo/ghi device và GitLab version theo [checklist](../../docs/verification-results.md).

Các inputs owner cần có khi thực hiện native/live tiếp theo: Mac/Xcode/iPhone và signing account; HTTPS GitLab/VPN, sandbox/version/tier; public OAuth Application ID hoặc PAT nhập trực tiếp; owner-verified CI/ref/environment policy. Push cần thêm trusted hosting/TLS/secret store/hook permissions và APNs/FCM signing. Không yêu cầu gửi credential vào chat.

Các acceptance chưa đạt được giữ trong plan/verification thay vì tick complete: native transfers/device auth/UI/E2E, real role/tier/policy workflows, hosted push, performance/real 7-day soak và dependency security gate. Store publish không thuộc đợt này theo người dùng.

Background processes dùng cho tests/export đã kết thúc; integration runner stop container trong `finally`. Không để dev server/worker/Metro chạy nền khi bàn giao. Local journal: [implementation journal](../journals/2026-10-04-implement-gitlab-mobile-source-and-iphone-handoff.md). AgentWiki/social publishing skipped.
