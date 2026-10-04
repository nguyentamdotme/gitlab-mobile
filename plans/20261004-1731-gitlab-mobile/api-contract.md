# Hợp đồng API và compatibility notes

## Quy ước

- GitLab REST prefix: `{instanceBaseUrl}/api/v4`; Self-Managed có thể có subpath. `:id` là **numeric project ID** ưu tiên; project path dùng URL-encoding nếu cần.
- `:iid` là IID của MR/issue trong project, không dùng global ID. Pipeline/job/deployment/schedule dùng numeric ID riêng.
- OAuth paths nằm ở instance root/base path, không thêm `/api/v4`. Chỉ TLS/trusted host; tokens ở auth header/form body theo endpoint, **không URL/query string/log**.
- OAuth API calls dùng bearer header; PAT adapter có thể dùng PRIVATE-TOKEN header. Client không chứa Client Secret, password, admin/sudo token hoặc CI_JOB_TOKEN để login người dùng.
- Bảng là hợp đồng **để implement**; không có endpoint nào đã được gọi với tài khoản thật. Sử dụng docs hiện hành với version gates, không assume mọi field có trên GitLab 17.

## OAuth / account

| Method/path | Dùng cho | Contract/security |
|---|---|---|
| Browser `GET /oauth/authorize` | Consent/login | response_type=code, client_id, redirect_uri, state, scope, code_challenge, code_challenge_method=S256; root_namespace_id nếu SAML group flow yêu cầu |
| `POST /oauth/token` | Code exchange | grant_type=authorization_code + client_id + code + redirect_uri + code_verifier; public client không có secret |
| `POST /oauth/token` | Refresh | grant_type=refresh_token + client_id + refresh_token; form body; response token pair xoay, đọc expires_in/created_at |
| `POST /oauth/revoke` | Best-effort revoke | public-client payload/behavior phải PoC trên instance; không thêm secret để fix; local logout độc lập |
| `GET /user` | Xác định tài khoản | Numeric user ID + instance namespace; không tin userId client tự khai ở backend |
| `GET /metadata`, `GET /version` | Version | Access có thể bị chặn; enterprise flag không chứng minh tier/license |

Read-only mode `read_api` + `read_user`; interactive mode `api`. Scope rộng cần consent minh bạch; không tự xin sudo/admin_mode/manage_runner. PAT không có OAuth refresh. Source: [OAuth](https://docs.gitlab.com/api/oauth2/), [Scopes](https://docs.gitlab.com/integration/oauth_provider/), [Metadata](https://docs.gitlab.com/api/metadata/).

## Projects / repository / issues

| Method/path | Tính năng |
|---|---|
| `GET /projects?membership=true&search=...`, `GET /projects/:id` | Project list/detail; server-side search/pagination |
| `GET /projects/:id/repository/branches`, `GET /projects/:id/repository/tags` | Branch/tag picker |
| `GET /projects/:id/repository/commits`, `GET /projects/:id/repository/commits/:sha` | Commit list/detail |
| `GET /projects/:id/repository/tree` | Tree với ref/path/pagination |
| `GET /projects/:id/repository/files/:file_path` | File read-only; URL-encoded path/ref; reject binary/large render |
| `GET /projects/:id/issues`, `GET /projects/:id/issues/:iid` | Issue list/detail |
| `POST /projects/:id/issues`, `PUT /projects/:id/issues/:iid` | Create/edit/assign/labels/state_event close/reopen theo quyền |
| `GET /projects/:id/issues/:iid/notes`, `POST /projects/:id/issues/:iid/notes` | Issue comments |

Source: [Projects](https://docs.gitlab.com/api/projects/), [Repositories](https://docs.gitlab.com/api/repositories/), [Branches](https://docs.gitlab.com/api/branches/), [Tags](https://docs.gitlab.com/api/tags/), [Commits](https://docs.gitlab.com/api/commits/), [Repository files](https://docs.gitlab.com/api/repository_files/), [Issues](https://docs.gitlab.com/api/issues/), [Notes](https://docs.gitlab.com/api/notes/). Các family thông thường phải đối chiếu thêm params/permission/version cụ thể ở phase 03; không dùng bảng rút gọn để đoán toàn schema.

## Pipelines / jobs / artifacts

| Method/path | Tính năng | Điểm cần giữ đúng |
|---|---|---|
| `GET /projects/:id/pipelines` | List/filter | Pagination, status/ref/source; dashboard fan-out từ pins có bound |
| `GET /projects/:id/pipelines/:pipeline_id` | Detail | Source/ref/SHA/timing; enum mới → unknown fallback |
| `GET /projects/:id/pipelines/:pipeline_id/jobs` | Jobs/stages | include_retried tùy UI; không gọi stage list là DAG chính xác |
| `GET /projects/:id/pipelines/:pipeline_id/bridges` | Trigger/downstream | downstream_pipeline nullable; downstream có thể khác project |
| `POST /projects/:id/pipeline` | Run pipeline | **Singular pipeline**; ref required, optional variables/inputs có gates |
| `POST /projects/:id/pipelines/:pipeline_id/retry` | Retry pipeline | Chỉ failed/canceled jobs; không rerun successful pipeline để redeploy |
| `POST /projects/:id/pipelines/:pipeline_id/cancel` | Cancel | 200 không chứng minh tất cả jobs đã terminal; GET reconcile |
| `GET /projects/:id/jobs/:job_id` | Job detail | Nullable runner/environment/artifacts, archived states |
| `GET /projects/:id/jobs/:job_id/trace` | Log file | Text file/polling; không guaranteed SSE/Range/cursor/streaming |
| `POST /projects/:id/jobs/:job_id/retry` | Retry job | Response ID có thể mới; trigger job retry support từ 17.0 |
| `POST /projects/:id/jobs/:job_id/cancel` | Cancel job | Force cancellation không mặc định, chỉ explicit workflow |
| `POST /projects/:id/jobs/:job_id/play` | Manual job | Chỉ manual status; job_variables_attributes nếu allowed; job_inputs từ 18.10 |
| `GET /projects/:id/jobs/:job_id/artifacts` | Download archive | Binary và CDN redirect; strip auth cross-origin |
| `GET /projects/:id/jobs/:job_id/artifacts/*artifact_path` | Specific artifact | Sanitize file path/name, no auto HTML/ZIP execution |
| `GET /projects/:id/pipelines/:pipeline_id/test_report_summary` | Summary | Cần JUnit reports; no report là empty, không tự infer pass |
| `GET /projects/:id/pipelines/:pipeline_id/test_report` | Tests detail | Pagination theo endpoint, large suites không load hết RAM |

Pipeline `inputs`: introduced 17.10, GA 18.1. Không tự gửi fields mới khi unknown compatibility; variables fallback chỉ khi CI/policy cho phép. Global `/pipelines` hiện có ở versions mới (19.3+) **không làm dependency** baseline/dashboard. Branch/tag create pipeline khác MR pipeline `POST /projects/:id/merge_requests/:iid/pipelines`, chỉ implement khi cần rerun MR đúng semantics. Không dùng trigger token/CI job token làm user auth.

Trace 404 có thể job/log bị xóa hoặc không quyền, không phải bằng chứng endpoint không tồn tại. Artifact expired/403/redirect signed URL hết hạn phải báo đúng; OAuth REST download không đồng nghĩa có thể login container registry để pull image. Source: [Pipelines](https://docs.gitlab.com/api/pipelines/), [Jobs](https://docs.gitlab.com/api/jobs/), [Job artifacts](https://docs.gitlab.com/api/job_artifacts/).

## Environments / deployments / schedules / lint

| Method/path | Tính năng | Contract |
|---|---|---|
| `GET /projects/:id/environments`, `GET /projects/:id/environments/:environment_id` | Environment list/detail | Non-existent/no permission handling; external URL untrusted |
| `POST /projects/:id/environments/:environment_id/stop` | Stop configured environment | Default không force; cần CI on_stop workflow/policy |
| `GET /projects/:id/deployments`, `GET /projects/:id/deployments/:deployment_id` | Deployment history/detail | deployable nullable; records không phải commands |
| `POST /projects/:id/deployments/:deployment_id/approval` | Approve deployment | Premium/Ultimate + appropriate policy/permission |
| `GET /projects/:id/pipeline_schedules`, `GET /projects/:id/pipeline_schedules/:schedule_id` | Schedule list/detail | owner/inputs fields tùy role/version |
| `POST /projects/:id/pipeline_schedules` | Create schedule | cron/cron_timezone/ref/active và gates cho inputs |
| `PUT /projects/:id/pipeline_schedules/:schedule_id` | Edit/toggle | Ownership/permission server-side, no blind retry |
| `DELETE /projects/:id/pipeline_schedules/:schedule_id` | Delete schedule | Explicit destructive confirmation; không bulk delete |
| `POST /projects/:id/pipeline_schedules/:schedule_id/play` | Run schedule now | Không đổi next scheduled run |
| `POST /projects/:id/pipeline_schedules/:schedule_id/take_ownership` | Ownership | User explicit và eligible permissions |
| `GET /projects/:id/pipeline_schedules/:schedule_id/pipelines` | History | Pagination và project/account namespace |
| `GET /projects/:id/ci/lint` | Existing config validation | content_ref/dry_run_ref cho GET; version gate params |
| `POST /projects/:id/ci/lint` | Draft validation/dry-run | content và project context; dry_run không chạy pipeline |

Schedules inputs introduced 17.11, GA 18.1; role visibility có giới hạn. Cron timezone/DST phải theo semantics GitLab. **Không có REST rollback chung**; không POST deployment record để deploy/revert. Project-specific rollback dùng existing CI job hoặc pipeline inputs, protected policy vẫn do GitLab quyết định. Source: [Environments](https://docs.gitlab.com/api/environments/), [Deployments](https://docs.gitlab.com/api/deployments/), [Schedules](https://docs.gitlab.com/api/pipeline_schedules/), [Lint](https://docs.gitlab.com/api/lint/).

## Merge Requests / discussions / approvals

| Method/path | Tính năng | Guard |
|---|---|---|
| `GET /merge_requests`, `GET /projects/:id/merge_requests`, `GET /projects/:id/merge_requests/:iid` | Inbox/list/detail | Filters assigned/reviewer/state theo version; use IID |
| `POST /projects/:id/merge_requests` | Create MR | Source/target existing branch, no source code write |
| `GET /projects/:id/merge_requests/:iid/diffs` | Diff files | Pagination/server limits; collapsed/too_large fields từ 18.4 |
| `GET /projects/:id/merge_requests/:iid/versions` | Revision metadata | SHA triple cho inline comments; latest revision race |
| `GET /projects/:id/merge_requests/:iid/discussions`, `POST /projects/:id/merge_requests/:iid/discussions` | List/new thread | body; inline position dùng base/head/start SHA + correct paths/line |
| `POST /projects/:id/merge_requests/:iid/discussions/:discussion_id/notes` | Reply | Auth/namespace, no optimistic-success |
| `PUT /projects/:id/merge_requests/:iid/discussions/:discussion_id` | Resolve/unresolve thread | Quyền user và resolvable state do server quyết định |
| `GET /projects/:id/merge_requests/:iid/approvals` | Approval summary | Available on Free; optional fields/tier |
| `POST /projects/:id/merge_requests/:iid/approve` | Approve | sha required by app; mismatch 409; reauth policy |
| `POST /projects/:id/merge_requests/:iid/unapprove` | Remove own approval | Current state/user eligible |
| `GET /projects/:id/merge_requests/:iid/approval_state` | Rule details | Premium/Ultimate; not baseline dependency |
| `PUT /projects/:id/merge_requests/:iid/merge` | Merge after user confirm | sha guard, state/CI/approval/protected rules; no bypass/auto-merge |

Không dùng `/changes` deprecated. Diff oversized không tự vượt giới hạn qua raw_diffs. Approval reauth/password/forced SAML có thể cần ngoại lệ web an toàn. Source: [MR](https://docs.gitlab.com/api/merge_requests/), [Discussions](https://docs.gitlab.com/api/discussions/), [Approvals](https://docs.gitlab.com/api/merge_request_approvals/).

## Webhook và notification service

GitLab hook setup: `GET`, `POST /projects/:id/hooks`; `GET`, `PUT`, `DELETE /projects/:id/hooks/:hook_id`. Requires admin/Maintainer/Owner. Hook secret không trả lại, update URL có thể reset legacy token; phải kiểm chứng/rotate khi thay config. Event flags pipeline/job/deployment/MR/note. Legacy X-Gitlab-Token là shared secret; HMAC `signing_token` từ 19.0, flag removal 19.1 theo docs hiện hành. Phải dùng verifier chính thức theo version, không chỉ kiểm tra event header. Source: [Project webhooks](https://docs.gitlab.com/api/project_webhooks/).

App-owned notification API **sẽ tạo**, không phải GitLab endpoint:

| Method/path | Auth và semantics |
|---|---|
| `POST /v1/session` | TLS + transient GitLab token, allowlisted instance; verify /user; issue device-bound service tokens |
| `POST /v1/session/refresh`, `DELETE /v1/session` | Service rotating refresh/revoke; không gia hạn GitLab permission lease tự động |
| `PUT /v1/devices/:deviceId` | Service session và đúng owner; register/update push address |
| `POST /v1/subscriptions`, `POST /v1/subscriptions/:id/renew` | Service auth + current GitLab token; verify user/project; 24h permission lease |
| `DELETE /v1/subscriptions/:id` | Owner session; cleanup-only opaque handle cho offline logout eventual unsubscribe, không cấp quyền đọc |
| `GET /v1/events/:opaqueId` | Service auth + current GitLab token; reverify user/project before returning route IDs |
| `POST /v1/webhooks/:registrationId` | GitLab-specific secret/signature, raw body/schema/project match/dedup, not user session |

Service TTL/leases cần user review trước implement; transient tokens không query strings hoặc logs. Generic pushes không chứa project/status/private content. Instance registry/egress chống SSRF là mandatory, không cho client arbitrary URL ở backend.

## Global error và mutation policy

- GET: bounded retry, 401 refresh một lần, 429 Retry-After; trusted redirect/pagination origins.
- POST/PUT/DELETE: preflight auth, explicit confirm theo risk, no automatic resend; timeout/process death sau dispatch = unknown + journal metadata tối thiểu trong SecureStore + reconcile bằng reads sau restart. Không lưu request body/variables/token hoặc auto replay.
- Mốc nội bộ sau phase 04 chỉ CI mutation trong non-production allowlist đã xác nhận; production/unknown environment cần phase 05 policy và safety gates. Notification worker rechecks leases/active state trước mỗi send/retry; OS push queue đã nhận không được hứa có thể thu hồi.
- 403: policy/permission deny, không refresh; 404: ambiguous deleted/denied/unsupported, không feature detect toàn instance chỉ bằng một resource.
- 409: reread SHA/state; 400/422: server validation/rules; 5xx/offline: giữ session và không queue CI writes.
- Capability flags là UI hints, không thay authorization của GitLab; version không đủ để suy ra permission/license/config.
