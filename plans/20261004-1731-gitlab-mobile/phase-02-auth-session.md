# Phase 02 — Authentication và phiên lâu dài

- Status: pending. Priority: P1. Effort: 6 ngày công / 48h.
- Dependency: phase 01; OAuth/public-client và redirect PoC đạt hoặc PAT-only exception được xác nhận.
- Mục tiêu: mở lại app sau hết access token vẫn dùng được mà không login web lại khi grant còn hợp lệ.

## Files dự kiến tạo

- `apps/mobile/src/core/auth/oauth.ts`: authorization request, callback, exchange, refresh/revoke.
- `apps/mobile/src/core/auth/session-manager.ts`: state machine, per-account single-flight, session generation.
- `apps/mobile/src/core/auth/credential-store.ts`: SecureStore schema/save/load/migrate/remove.
- `apps/mobile/src/core/auth/pat.ts`: PAT fallback, expiry/capability metadata khi xác định được.
- `apps/mobile/src/core/auth/account-registry.ts`: instance/client config và numeric user identity.
- `apps/mobile/src/core/security/app-lock.ts`, `redaction.ts`, `trusted-url.ts`: local lock, safe logging, auth-origin boundaries.
- `apps/mobile/app/(auth)/connect.tsx`, `oauth/callback.tsx`, `settings/accounts.tsx`: native connect/reconnect/switch/logout screens.
- Tests tương ứng trong `apps/mobile/src/core/auth/__tests__/` và `core/security/__tests__/`.

## Hợp đồng phiên

States: disconnected, authorizing, restoring, authenticated, refreshing, locked, temporarily-offline, refresh-outcome-unknown, reconnect-required. Offline không đồng nghĩa revoked; locked không đồng nghĩa logout. Auth callback chỉ hợp lệ cho một pending flow của instance/client/redirect xác định, có TTL và one-time state.

Credential record chứa schemaVersion, authKind, account identity, access token, refresh token (OAuth), createdAt, expiresAt, granted scopes và generation. Record không đi vào public contracts/query cache. Không dùng raw URL chứa `/` làm key SecureStore; encode/hash instance + user. Nếu native store không chứa được record do giới hạn dung lượng, fail closed và báo lỗi, không fallback AsyncStorage.

## Tasks

- [ ] Implement URL normalization giữ subpath/port, HTTPS và trusted origin; không gửi credentials của account A sang instance B.
- [ ] Implement PKCE S256, random `state`, exact redirect, TTL, canceled/denied flow và single-use callback. Khi app bị kill mất pending verifier thì khởi động lại login, không nhận code không còn liên kết phiên.
- [ ] Exchange code không có client secret. Xác định user `/user` và scopes trước khi commit session; thiếu response field quan trọng phải reject có kiểm soát.
- [ ] Restore từ SecureStore, refresh trước request khi token còn <60s; dùng server response lifetime, không hardcode 7200. Chỉ foreground/request-triggered refresh.
- [ ] Single-flight theo account: các request khác đợi cùng promise. Sau refresh, save cặp token mới và generation trước khi publish; không hai refresh dùng cùng old token.
- [ ] Generation guard: logout/switch account tăng generation; refresh/query trả muộn không được lưu hoặc cập nhật session cũ. Hủy request và polling của account không active.
- [ ] Phân biệt invalid_grant/revocation với network/429/5xx. Timeout sau dispatch có thể đã xoay token: không retry old refresh tự động vô hạn; dùng trạng thái outcome unknown và hướng reconnect nếu không phục hồi an toàn.
- [ ] Lưu lỗi save/crash-window thành reconnect-required khi không đảm bảo cặp token bền vững; không hứa transaction phân tán. Test crash sau server rotation, trước save.
- [ ] 401 không replay lệnh ghi: chỉ GET có thể refresh và retry một lần. Flow mutation dùng preflight ensureValidToken, khi 401 thì refresh cho thao tác tiếp theo và reconcile/để user retry có xác nhận.
- [ ] App lock sau background timeout cấu hình; mặc định đề xuất 5 phút khi người dùng bật lock. Step-up production xác thực sinh trắc học/device credential; nếu không có local auth phải bật hướng xác nhận thay thế theo policy, không coi local PIN custom là bảo vệ ngang Keystore.
- [ ] Credentials được bảo vệ bởi OS store; baseline `requireAuthentication` không bật tự động để tránh prompt mỗi refresh. Chế độ bảo vệ chặt hơn chỉ bật sau khi thử prompt/save/key invalidation trên cả nền tảng; app lock cũng che UI/previews và xóa nhạy cảm RAM khi khóa.
- [ ] Implement PAT nhập kín và xóa clipboard theo lựa chọn; không tự copy token, không hứa clipboard của OS được kiểm soát tuyệt đối. PAT không refresh và không tự rotate khi user chưa xác nhận.
- [ ] Logout: cancel first, best-effort OAuth revoke theo public-client hỗ trợ đã PoC, xóa store/cache/downloads/subscriptions; local logout offline luôn hoạt động. PAT nhập tay không mặc định revoke toàn token user dùng ở nơi khác; cung cấp unlink và hướng dẫn revoke.
- [ ] Android backup exclusion; first-install marker phát hiện Keychain còn sót ở iOS/reinstall; credentials không được migrate sang thiết bị khác theo policy khả thi.

## Acceptance criteria và test gate

- Restart, 2h+ token expiry giả lập, 7/30 ngày fake clock, multi-account và grant revoked đều có trạng thái đúng.
- 20 requests → 1 refresh/account; stale refresh sau logout/switch không hồi sinh phiên hoặc trộn cache.
- Mạng lỗi/429/5xx không xóa phiên; invalid_grant hết vòng retry và yêu cầu reconnect; timeout sau dispatch không tạo refresh loop.
- Callback state sai/host sai/code replay → reject; public-client bundle không có secret; log/analytics snapshot không có token/code/verifier/header nhạy cảm.
- App kill ở từng điểm rotation/save có expected outcome được ghi rõ. Không dùng test fake time để tuyên bố đã chứng minh real-world 30-day session.
- Biometrics cancel/không có hardware/đổi fingerprint/reinstall/backup restore được test trên thiết bị thật trước release.

Scripts **sẽ tạo và chạy khi implement**: `pnpm --filter mobile test:auth`, `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`; `test:auth` chạy Jest tập tests core/auth + core/security. Native Maestro flows: `tests/e2e/auth.yaml`, `session-restore.yaml`, `account-switch.yaml`. Offline logout và delayed refresh phải có integration tests.

## Failure protocol

Không giữ hoặc log secret để debug. Public revocation semantics chưa được instance chứng minh thì chỉ báo “đã xóa phiên trên thiết bị”, không claim grant revoked. Live reauth/SSO case cần policy owner; không thu GitLab password trong UI native.
