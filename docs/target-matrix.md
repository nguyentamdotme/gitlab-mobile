# Target matrix

| Target | Chọn cho development | Đã kiểm chứng trong session |
|---|---|---|
| Expo/React Native | SDK 57.0.26 / RN 0.86.3 / React 19.2.3 | Install, dependency check, Expo Doctor, iOS export và CNG |
| Toolchain | Node 24.21.0, pnpm 12.9.1, TypeScript 6.0.3 | Linux checks pass |
| iOS | iOS 16.4+, Xcode 26.4+, iPhone qua cáp | Native build/sign/device chưa chạy |
| Android | Android 7+, SDK theo Expo 57 | Chưa native build/device |
| GitLab.com | HTTPS, OAuth public client/PAT | Chưa tài khoản/sandbox live |
| Self-Managed | HTTPS, giữ subpath/port; baseline dự kiến 17.0+ | URL/fixture tests; chưa instance thật |
| Inputs | GitLab 18.1+ và policy enabled | Version gate tests; chưa live |
| Approval tiers | API approval cơ bản; deployment approval qua policy | Chưa license/live policy; không suy luận EE = Premium |
| Webhooks | Legacy shared token; Standard Webhooks từ 19.x | HMAC/legacy unit, DB integration; chưa webhook thật |
| Push | Receiver + Expo Push + APNs/FCM | Unit/integration; chưa native delivery |

Thiết bị tham chiếu dự kiến là iPhone thật của người dùng, qua cùng mạng với Mac và HTTPS GitLab/VPN thực tế. Model iPhone, OS, network latency và GitLab version cần ghi khi người dùng chạy. Budget Home shell P95 ≤2s/data page đầu ≤3s chưa được đo; không được suy ra từ bundle hoặc fake-clock tests.

Fixtures là synthetic và bao phủ missing/null/unknown state, SHA changes và lỗi mạng. Chúng không chứng minh toàn bộ role/tier matrix 17.0+, hoặc phiên thực tế 7/30 ngày.
