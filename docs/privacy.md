# Privacy

GitLab access/refresh tokens và PAT chỉ lưu trong OS secure storage trên thiết bị, không ở AsyncStorage, query persistence, notification DB hoặc analytics. App không thu password. Private project/issue/MR/diff/log data và drafts nằm trong RAM; đổi account/khóa/background che hoặc bỏ screens. Draft mất khi process đóng. Project pins, theme, app-lock và policy mapping là preferences được persist theo account.

Artifact explicit download nằm trong cache sandbox, xóa khi startup/logout/switch và sau share; file không tự mở/giải nén. Sharing do người dùng xác nhận và ứng dụng đích có thể giữ bản sao; app không thể thu hồi bản đã chia sẻ.

Notification receiver tin cậy tạm nhận access token để gọi GitLab `/user`/project, không persist hoặc log token. Service giữ hashed access/refresh/cleanup handles, owner/device mapping, push address, project subscription/preferences/lease, webhook keys mã hóa và normalized resource IDs. Full webhook body, comment, source, CI variables, trace/artifact không lưu DB.

Event metadata giữ tối đa 7 ngày; processed/dead outbox đi cùng event retention. Service session tối đa 30 ngày, subscription lease 24h cần reverify khi mở app. Push chỉ gồm thông điệp chung và opaque IDs, không tên project/ref/status/comment. Khi mở, service kiểm tra lại GitLab permission và app đọc resource trực tiếp.

Permission bị thu hồi có thể còn generic ping tới khi lease hết. Offline logout giữ cleanup handle riêng trong SecureStore để revoke service khi online, không cấp quyền đọc/ghi GitLab. Queue tối đa 8 cleanup handles; nếu store lỗi/queue quá giới hạn, lease vẫn là boundary cuối. Push đã được OS chấp nhận có thể đến trễ dù logout; không có bảo đảm thu hồi OS queue. Account/session không hợp lệ sẽ không resolve private route.

Settings cho phép unwatch, tắt push và xóa service data của phiên hiện tại. Logout xóa local credentials/cache/journal/files, best-effort OAuth revoke; PAT không tự revoke vì có thể đang dùng nơi khác. Muốn thu hồi toàn grant/token, dùng GitLab settings. Không có telemetry/crash collector mặc định; không đưa secret vào bug report.
