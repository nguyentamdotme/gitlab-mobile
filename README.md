# gitlab-mobile

Ứng dụng GitLab bằng React Native, Expo SDK 57 và TypeScript. App gọi trực tiếp GitLab REST v4; notification service riêng dùng Fastify và PostgreSQL.

## Chạy trên iPhone qua cáp

Trên Mac có Xcode, cài Node 24 và pnpm 12.9.1, rồi chạy:

```bash
pnpm install --frozen-lockfile
pnpm --filter mobile ios
```

Chọn iPhone đã kết nối, mở Developer Mode và cấu hình signing team trong Xcode khi cần. Cấu hình mặc định không yêu cầu entitlement APNs; chưa bật push hoặc cấu hình store submission. Chi tiết: [start/build và cài iPhone](docs/iphone-local-build.md).

## Tài liệu

[Docs index](docs/README.md) là điểm bắt đầu cho tài liệu dự án và agent context.

- [Development và kiểm tra thiết bị](docs/development.md)
- [Target matrix và coverage](docs/target-matrix.md)
- [Policy CI/deployment](docs/project-ci-policy.md)
- [Notification service](docs/notifications-operations.md)
- [Privacy](docs/privacy.md) · [Security](docs/security.md)
- [Verification results](docs/verification-results.md) · [Release giai đoạn sau](docs/release.md)

## Kế hoạch và kết quả thực thi

- [Kịch bản sử dụng, kiến trúc và roadmap](plans/20261004-1731-gitlab-mobile/plan.md)
- [Hợp đồng API và giới hạn tương thích](plans/20261004-1731-gitlab-mobile/api-contract.md)
- 7 phase triển khai với tasks, file ownership và tiêu chí nghiệm thu trong cùng thư mục kế hoạch.
- [Report triển khai và toàn bộ câu hỏi/giả định](plans/reports/implementation-261004-1903-current-plan.md)

**Trạng thái:** có source mobile/service, checks tự động và iOS bundle. Chưa build/chạy native trên thiết bị thật hoặc kiểm chứng GitLab sandbox; log/artifact có implementation nhưng khóa mặc định tới khi native transport được kiểm chứng. Plan giữ trạng thái in-progress. Publish Apple Developer, deploy service và release validation thuộc các bước tiếp theo.
