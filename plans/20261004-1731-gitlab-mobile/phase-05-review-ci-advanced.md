# Phase 05 — MR review, schedules và deployment workflows

- Status: pending. Priority: P2. Effort: 8 ngày công / 64h.
- Dependency: phase 04. Mục tiêu: hoàn thiện tương tác GitLab và CI/CD ngoài xử lý pipeline lỗi.

## Files dự kiến tạo

- `apps/mobile/src/features/merge-requests/api.ts`, `queries.ts`, `mutations.ts`, `screens/`, `diff-view.tsx`, `discussion-form.tsx`.
- `apps/mobile/src/features/environments/api.ts`, `queries.ts`, `screens/`, `deployment-policy.ts`, `redeploy-flow.tsx`.
- `apps/mobile/src/features/schedules/api.ts`, `queries.ts`, `schedule-form.tsx`, `mutations.ts`.
- `apps/mobile/src/features/pipelines/test-report.tsx`, `input-form.tsx`, `lint-screen.tsx`.
- Routes `apps/mobile/app/projects/[projectId]/merge-requests/`, `environments/`, `schedules/`, `ci-lint.tsx`.
- `docs/project-ci-policy.md`: project environment/risk/rollback mapping không chứa secrets.
- `tests/e2e/mr-review.yaml`, `schedules.yaml`, `deployment-policy.yaml` và module tests.

## Tasks: MR và issue completeness

- [ ] MR list/detail/create từ existing source/target branch, filter assigned/reviewer, CI head pipeline và merge readiness.
- [ ] Diff phân trang theo file và revision; handle collapsed/too_large/missing fields. Không dùng `/changes` deprecated. File vượt server diff limits chỉ link web/giải thích, không hứa `/raw_diffs` vượt mọi giới hạn.
- [ ] Comment/reply/resolve discussions khi có quyền; inline comment chứa base/start/head SHA và line/path đúng revision. Nếu MR đổi revision, invalidate draft position, yêu cầu xem lại.
- [ ] Approve/unapprove đúng head SHA; 409 refresh revision. Distinguish approve endpoint Free với approval rules/state cần Premium/Ultimate; không suy luận “tất cả approval API đều Premium”.
- [ ] GitLab policy yêu cầu password/forced SAML reauthentication không tương thích → disabled native approve + guided external link, không hỏi user password trong app.
- [ ] Merge chỉ user explicit confirm, SHA guard, reread merge status/CI và server policies. Không implement auto-merge/bypass checks/merge trains trong scope này; nếu project bắt buộc workflow chưa hỗ trợ thì chuyển link GitLab có giải thích.
- [ ] Issue assign/labels/edit metadata theo quyền; tránh tự overwite thay đổi đồng thời khi form stale.

## Tasks: CI/CD nâng cao

- [ ] Environment list/detail và deployment history/ref/SHA/status/external URL; nullable deployable không gây crash. API create deployment record không được dùng để chạy deployment.
- [ ] Link manual deployment job sang play flow phase 04; protected environment/deployment approval được hiển thị bằng capability/tier/policy, server authoritative.
- [ ] Optional deployment approval API bật khi tier/quyền đã xác minh; trạng thái approved không đồng nghĩa deploy completed.
- [ ] Redeploy deployment job cũ chỉ khi mapping policy đã chấp thuận, artifacts còn usable và job/CI script phù hợp. Explicitly distinguish redeploy với rollback.
- [ ] Rollback project-specific: pipeline chuyên dụng với ref/inputs cho target revision và allowed environment; user xem tác động và xác nhận. Không có generic rollback endpoint, không rollback database tự động, không pipeline retry để redeploy successful pipeline.
- [ ] Environment stop chỉ bật khi configured `on_stop` workflow và user có quyền; xác nhận. Không `force=true` mặc định vì có thể bỏ qua việc dọn tài nguyên. Không thêm delete environment/deployment.
- [ ] Schedule list/detail/create/edit/active toggle/play/delete; cron syntax và timezone, branch/tag ref ambiguity; owner/take ownership chỉ khi workflow có quyền và user xác nhận. Delete một schedule phải có destructive confirmation, không bulk delete và không auto retry khi outcome unknown.
- [ ] Mở CI mutation cho production/môi trường chưa phân loại chỉ sau khi project policy rõ, local step-up/confirmation/server protections và mandatory auth/mutation safety tests đạt. Mốc phase 04 luôn giữ non-production allowlist, không mở bằng toggle chưa kiểm chứng.
- [ ] Hiển thị next run/owner server state; play không thay đổi lần lịch kế tiếp. Không lấy scheduler trên điện thoại thay GitLab schedule.
- [ ] Pipeline inputs GA từ GitLab 18.1; schedule inputs GA 18.1 (introduced 17.11). Trên bản không hỗ trợ, không gửi field mới; variables chỉ fallback nếu CI config và chính sách cho phép, không bảo đảm semantics tương đương.
- [ ] Test report summary/details chỉ khi project xuất JUnit đúng; không có report hiển thị empty, không suy ra mọi job pass vì thiếu report.
- [ ] CI lint config hiện có/read-only draft: `GET /ci/lint` hoặc `POST /ci/lint` với content/context; dry_run mô phỏng config/rules, không chạy CI. Config includes có thể cần quyền/API context; lint pass không bảo đảm deploy sẽ thành công.
- [ ] Runner metadata read-only ở job detail; không quản lý/register/pause runners. Không expose hoặc sửa kho project/group CI secrets trên điện thoại.

## Acceptance criteria

1. Review MR → comment/resolve/approve đúng SHA; new push không approve/merge nhầm revision.
2. Version/tier/policy unsupported có explanation, không UI giả “đầy đủ GitLab Ultimate”. Quyền thực tế vẫn do API xác định.
3. Schedule create/update/play đúng timezone/ref, 403 và ownership changes được xử lý; không tạo schedule trùng khi timeout.
4. Deploy manual không vượt protected checks; job unknown environment dùng high-risk confirmation. Stop không force mặc định.
5. Redeploy/rollback chỉ xuất hiện cho project có policy đã test; artifact missing hoặc deployable null vô hiệu thao tác, không fallback tạo deployment record.
6. Lint/test reports không bị nhầm là chạy pipeline hoặc bảo đảm runtime correctness.

## Test gate dự kiến

`pnpm --filter mobile test:advanced` gồm MR revision race/approval reauth, schedules cron/timezone/ownership, nullable deployments/policy, inputs version gates và lint fixtures; `pnpm --filter mobile typecheck`; `pnpm --filter mobile lint`.

Live test mutations chỉ sandbox; cần người quản lý chấp thuận cả quy trình redeploy/rollback vì có thể chạm hạ tầng. E2E dùng disposable test environment, không test production. Free + Premium fixtures; live Premium coverage chưa có license thì ghi pending, không claim verified.

## Failure protocol

Không đoán quyền theo numeric role hoặc HTTP 404 duy nhất. Không đổi rollback spec để “làm cho nút hoạt động”; policy CI phải được chủ project cung cấp và test trước. Nếu MR approval cần mật khẩu, không tạo password vault; hỗ trợ ngoại lệ web hợp lệ.
