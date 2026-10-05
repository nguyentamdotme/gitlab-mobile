# Security và giới hạn kiểm chứng

Auth dùng PKCE S256, random state, exact dev callback và TTL 10 phút. Không có client secret trong bundle/config. Token lifetime từ response; per-account single-flight refresh, persistence trước publish và rotation-pending marker trước network. Response-lost/process death/save failure yêu cầu reconnect khi không thể biết cặp nào hợp lệ. Fake-clock 7/30 ngày không chứng minh phiên thực tế kéo dài.

API chỉ gửi bearer tới exact instance origin/subpath REST v4. Redirect API bị từ chối; external URL mở browser hệ thống với HTTPS và confirmation. Pagination không được đổi origin/path/filter. GET retry có bound; HTTP 401 chỉ refresh/retry GET một lần; writes không replay. Secure mutation intent không chứa body/variables/token, bắt buộc lưu trước dispatch; outcome unknown cần kiểm tra rồi acknowledge.

Native transfer đang khóa mặc định tới khi PoC byte bound/redirect đạt; xem [development](development.md). App lock dùng OS device authentication, không bypass GitLab permission/approval. Android backup bị tắt; SecureStore device-only trên iOS. Native reinstall/biometrics/preview/backup tests còn phải chạy.

Service chỉ fetch operator-allowlisted HTTPS instances; DNS resolve bị lọc và kết nối pin vào địa chỉ đã xét, không theo redirect. Loopback/link-local/cloud metadata luôn bị từ chối, private range cần registry `allowPrivate` explicit và network egress controls bổ sung. Không cho app nhập arbitrary receiver/instance URL để backend fetch. Raw webhook verify constant-time; signed registration không fallback legacy khi thiếu signature.

Receiver có body/rate/time limits và không ghi request log. DB transaction event/outbox và unique identity chống duplicate. Worker rechecks active session/device/subscription/lease/preferences/TTL khi xử lý từng send/retry; không hứa authorization revocation nguyên tử với delivery tới Expo/APNs. Crash sau Expo nhận push trước khi lưu ticket có thể tạo generic ping trùng; không có exactly-once delivery xuyên dịch vụ.

## Dependency findings 2026-10-04

`pnpm audit --prod --audit-level high` hiện **fail**, có 2 high chưa có bản patched:

- `node-forge@1.4.0` qua Expo CLI/code-signing tooling: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
- `braces@3.0.3` qua Metro/micromatch: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Đây là dependency trong toolchain hiện tại; app không trực tiếp dùng RSA forge hoặc nhận glob pattern từ GitLab user content. Điều đó không xóa finding hoặc chứng minh toàn toolchain an toàn. Không tắt audit/allowlist advisory để làm CI xanh. Store/release security gate vẫn chưa đạt, cần upstream fix hoặc giải pháp được kiểm chứng trước release.

CI secret scan chỉ kiểm tra một số patterns và suppress matching values, không thay thế secret review. Live TLS, native redirect, device memory và public-client OAuth PoC cần sandbox/thiết bị thật.
