# Phase 04 — CI/CD lõi: pipeline, jobs, log và artifacts

- Status: pending. Priority: P1. Effort: 9 ngày công / 72h.
- Dependency: phase 03; trace/artifact transport PoC phase 01 đạt.
- Mục tiêu: xử lý pipeline lỗi và chạy CI/job manual đã được xác nhận an toàn trên điện thoại, không cần duyệt web. Mốc nội bộ khóa production và môi trường chưa phân loại; cần phase 05 + safety gates để mở chúng.

## Files dự kiến tạo

- `apps/mobile/src/features/pipelines/api.ts`, `types.ts`, `queries.ts`, `mutations.ts`, `screens/`: list/detail/run/retry/cancel và test fixtures.
- `apps/mobile/src/features/pipelines/polling.ts`, `stage-view.tsx`, `downstream.ts`: active-screen polling, stage grouping và bridges/downstream.
- `apps/mobile/src/features/jobs/api.ts`, `queries.ts`, `mutations.ts`, `job-detail.tsx`: job/read/run/retry/cancel và IDs mới.
- `apps/mobile/src/features/jobs/trace-reader.ts`, `trace-view.tsx`, `ansi.ts`: bounded log retrieval, safe display/search.
- `apps/mobile/src/features/jobs/artifact-downloader.ts`, `artifact-list.tsx`: binary transport/redirect/quota/share/cleanup.
- `apps/mobile/src/core/gitlab/mutation-reconciliation.ts`: outcome unknown và re-read, không tạo idempotency giả.
- `apps/mobile/src/core/storage/mutation-journal.ts`: pending intent nhỏ trong SecureStore để phục hồi sau process death; không lưu variables/body/credentials và không auto replay.
- `apps/mobile/src/core/security/action-policy.ts`, `action-confirmation.tsx`: risk classification, confirm/step-up.
- `apps/mobile/app/(tabs)/ci.tsx`; routes `apps/mobile/app/projects/[projectId]/pipelines/` và `jobs/`.
- `tests/e2e/ci-run.yaml`, `ci-failure-retry.yaml`, `manual-job.yaml`, `artifacts.yaml`.

## Tasks và thứ tự triển khai

### 1. Read-only trước

- [ ] Pipeline list/filter status/ref/source, details SHA/ref/source/timing/actor; phân trang đầy đủ.
- [ ] Job list theo pipeline/stage với retried jobs tùy chọn; hiển thị unknown/new status không crash. Stage list không giả DAG chính xác nếu API không có needs graph.
- [ ] Bridges/downstream pipeline khác project hoặc child pipeline được truy cập theo project ID thật; 403/404 hiển thị “không có quyền hoặc không còn tồn tại”. Không dùng ID parent để gọi downstream nhầm project.
- [ ] Distinguish manual, delayed/scheduled, skipped, pending, running, failed, success, canceled, canceling, blocked và allow_failure. Không tự “play” delayed job hoặc archived job.
- [ ] Poll chỉ screen active/online/foreground, terminal thì stop; cancel AbortController để không apply out-of-order stale response.

### 2. Log và artifacts an toàn

- [ ] GET trace text; virtualized lines, ANSI whitelist, jump-to-end, search, copy user-selected đoạn. Không render log bằng HTML/WebView thực thi.
- [ ] Bounded retrieval ~1 MiB: hard byte cap/abort phải ở transport khi body lớn; nếu fetch/native runtime không chứng minh được cap, không auto-poll trace quá lớn, chuyển file download explicit. View cap sau full-download không phải memory bound.
- [ ] Poll 5–10s khi log nhỏ/job active, backoff/stop offline/background/terminal; không assume Range/cursor/WebSocket có trên REST trace.
- [ ] Artifact metadata/expiry + download theo job ID ưu tiên để định danh chính xác revision. GET binary, cancel/progress nếu transport hỗ trợ, size/quota và filename sanitization.
- [ ] Cross-origin CDN redirect dùng request không Authorization/PRIVATE-TOKEN; không token trong URL. Redirect không ký/hết hạn mà cần credential ở origin không tin cậy → fail closed, không “forward token để chạy được”.
- [ ] Không auto-unzip/open HTML/APK; sandbox storage, confirmation share, startup/logout expiry cleanup và quota policy. File lớn tải theo yêu cầu, không giữ binary trên JS heap.

### 3. Lệnh CI có kiểm soát

- [ ] Run pipeline dùng POST singular `/projects/:id/pipeline`, ref từ branch/tag API; variables theo project policy; inputs chỉ khi version/config hỗ trợ, không dùng làm kho secret.
- [ ] Pipeline retry nghĩa là retry failed/canceled jobs, không “run toàn bộ pipeline lại”; cancel có thể trả 200 mà job chưa terminal, phải đọc lại.
- [ ] Job retry trả job mới: route/cache cập nhật ID và list retried; không poll job cũ để kết luận retry thất bại.
- [ ] Manual job play từ explicit user action, reread status, confirm ref/SHA/environment. Job deploy/prod hoặc environment unknown cần confirm rủi ro và local step-up; authorization server vẫn quyết định.
- [ ] Mốc nội bộ chỉ bật mọi CI mutation (run/retry/play/cancel) trên project/job/ref allowlist được chủ project xác nhận non-production hoặc không tác động production. Không xác định được environment/tác động thì read-only; confirmation đơn thuần không mở khóa. Production/unknown-environment cần phase 05 policy và mandatory safety gate.
- [ ] Prevent double tap/in-flight repeats; preflight ensureValidToken; không retry write tự động vì 401/429/5xx/network error.
- [ ] Trước dispatch, save journal intent tối thiểu: account namespace, action type, numeric target IDs, timestamp, SHA/ref fingerprint nếu cần và generation; không variables/comment body/token. SecureStore size/quota có bound; không lưu được journal thì chưa gửi lệnh. Journal không là offline queue.
- [ ] Sau response success, invalidate pipeline/jobs/environment affected; toast không đồng nghĩa job đã hoàn tất. Clear journal khi đã reconcile/acknowledge kết quả; giữ uncertain intent khi process death/timeout.
- [ ] Timeout sau gửi hoặc process death → outcome unknown. Sau restart, restore account rồi đọc journal/reconcile bằng GET; không resend. Match IDs/ref/SHA/time window có thể không duy nhất: khi chưa phân biệt được, thông báo và chặn action tương đương cho tới user xác nhận đã kiểm tra. Logout xóa journal; account khác không nhận intent cũ.

## Acceptance criteria

- User xem pipeline thất bại → job/log → retry → job mới/status mới hoàn toàn trong app.
- Run pipeline/manual play/cancel hoạt động khi có quyền và xác nhận; lỗi CI YAML/rules/variables/protected policy có thông điệp hữu ích.
- 20 pipelines/100+ jobs, trace lớn và artifact lớn không làm mất native responsiveness trong target budget đã đo; trace polling không tải lại file lớn không giới hạn.
- API 403/404/409/429, offline sau dispatch, double tap, account switch và process kill sau dispatch không tạo lệnh trùng hoặc chạy sai project; pending journal được restore mà không auto execute.
- Production/unknown environment không thể mutation trong mốc nội bộ; auth/mutation safety gates được chạy trước phân phối nội bộ, không chờ phase 07.
- Không có bearer leak ở CDN, pagination/avatar/external URLs; binary file tải chính xác theo checksum fixture, revoked/expired artifact không báo thành công.
- Mốc nội bộ sau phase này chưa có schedule CRUD/MR review/background push; UI không đặt nút giả cho chúng.

## Test gate dự kiến

`pnpm --filter mobile test:ci` chạy tests features/pipelines, jobs, polling, action-policy và mutation-reconciliation; `pnpm --filter mobile typecheck`; `pnpm --filter mobile lint`.

Contract read-only mặc định. CI write E2E cần sandbox được cho phép, jobs không có production credentials. Fixture network faults trước dispatch/sau dispatch, retry ID khác, bridge permission deny, running → canceling → canceled, canceled response 200 nhưng chưa terminal, job archived, large trace, redirect loop/off-origin/signed URL expiry. Real-device profiling log/artifact ở phase 07. Thêm process-kill trước dispatch/sau dispatch/trước journal cleanup, SecureStore quota failure và cross-account journal tests; journal chỉ metadata và không replay. Safety gates auth, no-write-retry, journal, account isolation, redirect boundaries và non-production allowlist bắt buộc trước mốc nội bộ.

## Failure protocol

Transport redirect/byte-bound chưa an toàn thì khóa phần tải tương ứng và ghi blocker, không downgrade bảo mật. Không biến retry pipeline thành cơ chế rollback; không thực hiện mutation chỉ để dò API hỗ trợ. Production action chưa có policy rõ ràng chỉ cho read-only.
