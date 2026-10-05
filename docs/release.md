# Release ở giai đoạn sau

Phạm vi hiện tại là build/run iPhone qua cáp; không có store submission, paid account purchase, cloud build, backend deploy hoặc GitLab production changes. Làm theo [iPhone local build](iphone-local-build.md) để chạy local. Cấu hình CNG mặc định bỏ APNs entitlement khi chưa cấu hình EAS project ID.

Trước publish Apple Developer/TestFlight/App Store hoặc Android distribution cần chốt bundle ID/branding/Universal Link domain, signing, privacy disclosure, toolchain/store rules tại thời điểm phát hành và nội dung app-service hosting.

Release gate còn yêu cầu signed release candidate trên thiết bị thật mỗi OS được hỗ trợ; auth/callback/lock/reinstall/backup/trace/artifact/push/network tests; live role/tier/policy sandbox; performance measurements; soak 7 ngày thật; không high/critical unresolved. Xem [verification results](verification-results.md). iOS JS export hoặc CNG không thay các gate này.

Production CI/rollback chỉ dùng policy do chủ project thử và phê chuẩn; không mở bằng setting chưa được kiểm chứng. Notification push provisioning có thể cần Apple capabilities dù không publish store; giữ optional cho local cable build.

Rollback app/service khác rollback hệ thống do CI triển khai: giữ version/lockfile trước đó, rebuild app bằng signing tương ứng, rollback service binary cùng schema tương thích. Backup PostgreSQL trước migration; không drop tables hay xóa user GitLab resources để chữa lỗi. Source scripts migration/backup tại `apps/notification-service/scripts`; không deploy tự động từ CI hiện tại.
