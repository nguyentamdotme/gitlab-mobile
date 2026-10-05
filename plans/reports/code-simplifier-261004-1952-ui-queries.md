# Báo cáo đơn giản hóa UI và query

## Phạm vi

- `apps/mobile/src/components/ui.tsx`
- `apps/mobile/src/features/home/dashboard.tsx`
- `apps/mobile/src/features/ref-picker.tsx`

`apps/mobile/src/core/query/provider.tsx` chỉ được đọc để đối chiếu hợp đồng trạng thái và bảo mật.

## Kết quả

- Tách JSX lồng sâu thành cấu trúc nhiều dòng dễ đọc và rà soát.
- Đặt tên cho các giá trị dẫn xuất như trạng thái query được bật, điều kiện polling, trạng thái cần kết nối lại, kết quả lọc ref và trang kế tiếp.
- Tách callback đổi loại ref để làm rõ việc luôn đặt lại trang về `1`.
- Giữ nguyên export, import, query key, điều kiện tải/polling, phân trang, thông báo lỗi và nội dung hiển thị.

## Xác minh

- `pnpm --filter mobile typecheck`: đạt.
- `pnpm --filter mobile lint`: đạt.

Không phát hiện vấn đề còn tồn tại trong phạm vi được giao.
