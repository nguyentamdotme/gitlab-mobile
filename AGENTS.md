# Project instructions

- Dùng pnpm và frozen lockfile cho install tái lập; không sửa lockfile thủ công.
- Giữ native config trong `apps/mobile/app.config.ts` và config plugins. `ios/` và `android/` là output CNG; không dùng chỉnh tay trong đó làm implementation bền vững. Signing team cục bộ trong Xcode là ngoại lệ cho lần chạy thiết bị.
- Khi sửa auth/HTTP/notification, kiểm tra delayed response sau switch/logout và persistence đang chạy. Không publish credential mới trước khi lưu; không tự thử lại refresh có kết quả chưa rõ hoặc replay GitLab write.
- Không mở CI policy mặc định hoặc native transfer gate để làm màn hình/check xanh. Owner-verified project policy và bằng chứng native transport là yêu cầu riêng; không suy ra từ fixtures hoặc confirmation dialog.
- Chạy test hẹp cho invariant bị sửa trước, rồi `pnpm verify` khi thay shared contract. PostgreSQL integration dùng runner disposable; không trỏ vào database phát triển/production.
- Phân biệt JS export/CNG, native signed build và thử trên thiết bị thật khi báo kết quả. Không tick native/live/push/performance/soak gates bằng kết quả unit.
- Dùng cùng port Metro của project, kiểm tra owner trước khi start; dừng process/container do mình tạo khi xong.
- Giữ failed dependency/security gates hiển thị; không suppress advisory để qua CI.
- Theo [docs index](docs/README.md) để tìm owner của workflow và operating guidance.
- Theo [iPhone local build](docs/iphone-local-build.md) để chạy trên thiết bị; publish Apple Developer là scope riêng.
- Ghi evidence/câu hỏi/giả định vào `plans/reports/`; không biến report hoặc plan lịch sử thành authority cho hành vi hiện tại.
