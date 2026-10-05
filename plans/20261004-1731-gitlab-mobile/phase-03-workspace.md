# Phase 03 — Workspace, repository và issues

- Status: pending. Priority: P2. Effort: 5 ngày công / 40h.
- Dependency: phase 02. Mục tiêu: nền API/query ổn định và thao tác hằng ngày trước khi thêm CI.

## Files dự kiến tạo

- `apps/mobile/src/core/gitlab/client.ts`, `errors.ts`, `pagination.ts`, `adapters.ts`: fetch, network policies, safe DTO mapping.
- `apps/mobile/src/core/query/client.ts`, `keys.ts`, `lifecycle.ts`: query namespace/invalidation/focus-online management.
- `apps/mobile/src/core/storage/preferences.ts`: project pin/theme/account preferences, không chứa private content.
- `apps/mobile/src/features/home/`, `projects/`, `repository/`, `issues/`: API adapters, hooks, screens/components và tests.
- `apps/mobile/app/(tabs)/index.tsx`, `projects.tsx`, `inbox.tsx`, `settings.tsx`; `apps/mobile/app/projects/[projectId]/` cho project/repository/issues routes.
- `apps/mobile/src/components/`: status badge, empty/error/offline state, confirmation sheet, paginated list, safe markdown/diff primitives.
- `tests/e2e/workspace.yaml`, `issues.yaml`; fixture tests ở `apps/mobile/src/core/gitlab/__tests__/`.

## Tasks

- [x] Implement HTTP client injection token theo trusted origin; Accept/Content-Type chuẩn, response type text/json/binary tách riêng; timeout và abort khi logout/navigation.
- [x] GET retry có giới hạn/backoff/jitter; 429 Retry-After; POST/PUT không auto retry, kể cả query library defaults. Không biến HTTP 403 thành auth refresh.
- [x] Pagination X-Next-Page/Link theo từng endpoint, giữ query/filter, kiểm tra origin/subpath trước theo link; không cần biết total count để tải tiếp.
- [x] Adapters kiểm tra essential IDs/status và chấp nhận optional/null/unknown enum; không gãy app khi GitLab thêm trường.
- [x] GET `/metadata` hoặc `/version` nếu có quyền để đọc baseline; không suy luận edition EE = license Premium. Feature flags kết hợp version/config/permission và kết quả read an toàn; không probe bằng mutation.
- [x] Projects membership/search/pin, project detail với namespace/default branch/access metadata. Role chỉ là tín hiệu UI; inherited/custom permissions và server policy vẫn là quyết định cuối.
- [x] Repository tree/branch/tag/commit/file read-only, pagination; file binary/quá lớn không cố render text. Không tự clone repo hoặc đưa token vào clone URL.
- [x] Issues list/detail/search/filter; create/comment/đóng-mở; hiển thị trạng thái pending/unknown khi request timeout, không optimistic success.
- [x] Dashboard query số project có giới hạn; UI gắn tài khoản/instance đang active và last-updated. Không fetch pipeline của mọi project qua fan-out vô hạn.
- [x] RAM cache cho private content; chỉ persist project IDs ghim và preferences theo account. Không tự lưu issue body/draft/diff/log vào AsyncStorage; draft in-memory có thể mất khi process bị kill và UI nói rõ.
- [ ] Theme sáng/tối, touch targets ≥44 pt iOS/48 dp Android, labels cho screen reader, status có text ngoài màu, font scaling, loading/empty/403/404/offline states.
- [x] External/avatar URLs dùng request không có GitLab token; markdown bỏ raw HTML, safe link validation và prompt mở external URL khi cần.

## Acceptance criteria

1. Tải project nhiều trang không mất filter/duplicates hoặc lộ auth qua pagination URL độc hại.
2. User đọc được nhưng không ghi được có nút/action UX đúng; server 403/protected error giải thích rõ và không logout.
3. Issues create/comment timeout không resend tự động, double tap chỉ một mutation; user có cách kiểm tra lại kết quả.
4. Chuyển account hủy queries cũ, namespace không trộn dữ liệu; RAM/offline behavior khớp scope không có persistent private cache.
5. Branch/path chứa `/`, space, Unicode và Self-Managed subpath URL-encode đúng; project numeric ID và issue IID không bị nhầm.
6. Home đo theo target device/network, không claim performance từ simulator duy nhất.

## Kiểm thử dự kiến

`pnpm --filter mobile test:workspace` chạy Jest client/pagination/adapters/query namespace và features home/projects/repository/issues; `pnpm --filter mobile typecheck`; `pnpm --filter mobile lint`. Test server fixtures: pagination hostile origin, 401/403/404/429, latency/abort, null fields, malformed DTO, account-switch race, network loss giữa create/comment.

`pnpm test:contracts:read` được khai báo trong root workspace, live mode mặc định chỉ GET và target allowlisted. Cần quyền dùng sandbox trước khi thử create/comment. E2E native workspace/issues chạy trên development builds; verify chưa có sensitive content trong preferences/files/logs.

## Failure protocol

Không thêm offline write queue để che lỗi mạng, không lấy role integer làm bảo đảm quyền. Nếu API metadata bị chặn vẫn cho core app hoạt động trong conservative compatibility mode; 404 resource không được cache thành “endpoint absent” cho toàn instance.

## Execution evidence — 2026-10-04

HTTP trusted boundary/pagination/GET backoff, RAM Query lifecycle, project/pins/Home/Inbox, repository read-only và issue CRUD/comment/metadata đã có source; client/DTO tests pass.

Chưa sandbox role/contract, native workspace journeys, accessibility và Home latency trên thiết bị.

Checkbox đã đánh dấu ghi nhận task source-level, không chứng nhận acceptance/native/live của toàn phase. Dòng Status ở đầu là snapshot ban đầu; overall plan vẫn in-progress. [Final report](../reports/implementation-261004-1903-current-plan.md) chứa coverage và questions/assumptions; [verification](../../docs/verification-results.md) ghi check thực tế.
