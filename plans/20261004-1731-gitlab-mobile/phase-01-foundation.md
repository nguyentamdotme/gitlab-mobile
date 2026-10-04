# Phase 01 — Foundation và feasibility

- Status: pending. Priority: P1. Effort: 3 ngày công / 24h.
- Dependency: không. Gate tiếp theo: auth PoC không cần client secret.
- Mục tiêu: chứng minh các yêu cầu khó khả thi trước khi xây màn hình hàng loạt.

## Phạm vi và files dự kiến

Đường dẫn trong toàn bộ kế hoạch là đường dẫn đầy đủ từ repository root, **chưa tồn tại**, trừ `README.md`.

| Hành động | Đường dẫn | Trách nhiệm |
|---|---|---|
| Create | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Workspace/mobile/backend/contracts; được tạo bởi package manager/scaffolder |
| Create | `apps/mobile/package.json`, `apps/mobile/app.config.ts`, `apps/mobile/tsconfig.json` | Expo SDK stable được pin, app IDs và native config |
| Create | `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx` | Root navigation/shell, auth gate placeholder |
| Create | `apps/mobile/src/core/gitlab/types.ts`, `apps/mobile/src/core/gitlab/capabilities.ts` | DTO tối thiểu, unsupported/unknown states |
| Create | `packages/contracts/src/index.ts` | Model không chứa credentials, account namespace và push route contract |
| Create | `tests/fixtures/gitlab/`, `docs/target-matrix.md`, `docs/development.md` | Synthetic fixtures, baseline version/role/device/network và cách chạy |
| Modify | `README.md` | Hướng dẫn bootstrap và link tài liệu |

## Tasks

- [ ] Chốt instance GitLab.com/Self-Managed, version thấp nhất, subpath, VPN/CA và sandbox project. Nếu chưa có instance thực, ghi rõ chưa chứng minh khả năng kết nối/live contract.
- [ ] Chốt Android/iOS, bundle/package IDs, domain HTTPS callback production và scheme dev riêng. Không dùng domain ví dụ làm production redirect.
- [ ] Chọn Expo SDK stable từ official compatibility matrix, Node/package manager tương thích; scaffold workspace/mobile bằng công cụ/package manager. Xác nhận dependency mới trước khi cài; không sửa lockfile/manifests thủ công.
- [ ] Thiết lập TypeScript strict, lint, formatting, Jest, Testing Library và scripts thống nhất; `.gitignore` loại trừ local secret/test session/build output. Chưa cần UI library lớn.
- [ ] Native development build trên Android; iOS build khi có macOS/EAS access. Không dùng Expo Go để chứng minh OAuth/deep link/push.
- [ ] Đăng ký public/non-confidential OAuth application qua người có quyền; scope `api`, exact dev/prod redirect. Ghi Application ID vào config không bí mật; Client Secret không được nhập app hoặc repo.
- [ ] PoC system-browser OAuth callback + PKCE S256 + token exchange + refresh không có client secret. Nếu instance không cho public client, dừng và quyết định PAT fallback hoặc auth proxy; không nhúng secret để “fix”.
- [ ] PoC auth redirect cold start/warm start/canceled; xác định app có nhận được HTTPS App/Universal Link trên bản SDK chọn hay không. Static domain association không cần backend giữ token.
- [ ] PoC tải trace có giới hạn byte và binary artifact qua redirect; kiểm chứng transport không chuyển auth sang origin khác. Nếu không kiểm soát được redirects bằng Expo transport hiện tại, cần adapter native được đánh giá hoặc vô hiệu hóa download; không chọn cách rò token.
- [ ] Tạo fixture synthetic cho role/version/trạng thái; không lấy logs thật chứa secrets làm fixture. Prototype navigation 5 tabs và screen map, chưa cần render thiết kế pixel-perfect.

## Acceptance criteria

1. Workspace install tái lập bằng frozen lockfile; mobile build development mở được ít nhất trên Android.
2. Config không có secret; OAuth public-client PoC có exchange/refresh không secret hoặc blocker được ghi cụ thể.
3. Scope/session, callback URI và transport strategy được ghi bằng quyết định; không có unresolved “client secret nằm ở đâu”.
4. Capability matrix không dựa vào global pipelines mới; fixtures có missing/null/new fields để kiểm tra forward compatibility.
5. Thiết bị/network tham chiếu cho performance có định nghĩa; target matrix phân biệt verified và planned.

## Kiểm thử dự kiến, chưa chạy

Sau khi phase tạo scripts: `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm --filter mobile test -- --runInBand`. Native build dùng script `pnpm --filter mobile build:dev:android` do phase này khai báo, hoặc Expo CLI tương đương được ghi trong development guide. Cloud/EAS build có chi phí và native provisioning cần phê duyệt trước.

Manual checks: callback exact match; wrong `state`; host mismatch; dev vs production app link; self-managed subpath; CDN redirect bằng server fixture không có real token. PoC GitLab live chỉ thực hiện với sandbox đã được cho phép; credential truyền qua secure runtime, không argv/log.

## Failure protocol

Blocker về OAuth policy, TLS, domain ownership hoặc native redirect phải được quyết định trước phase 02. Không bypass certificate validation, không downgrade HTTPS, không tiếp tục xây flow dựa trên callback chưa hoạt động. Thiếu iOS/real device không làm giả claim cross-platform: ghi pending coverage và khóa release gate tương ứng.
