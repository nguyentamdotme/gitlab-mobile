# Verification results

Session 2026-10-04, Linux, Node 24.21.0. Đây là evidence development; không phải chứng nhận native/release. Script declarations là source authority tại root và các workspace `package.json`.

| Check | Kết quả | Evidence / giới hạn |
|---|---|---|
| Frozen lockfile install | Pass | Final `pnpm install --frozen-lockfile` |
| `pnpm -r typecheck` | Pass | Mobile/contracts/backend strict TypeScript |
| `pnpm -r lint` | Pass | Không suppress failing rule |
| Mobile Jest | 83 pass | Auth/network/mutation/capability/DTO/transport synthetic tests |
| Backend unit | 21 pass | HMAC/legacy/SSRF/normalization/quiet hours |
| PostgreSQL integration | 10 pass | Disposable PostgreSQL 17, backup trước schema/data setup; không live GitLab/push |
| Expo install check | Pass | SDK-compatible dependencies |
| Expo Doctor | 21/21 pass | CLI config/dependency checks |
| iOS JS export | Pass | Hermes bundle được export; không phải IPA/native signing |
| iOS CNG | Pass | Xcode project/config sinh trên Linux; default entitlements không APNs |
| Secret pattern scan | Pass | Pattern scan có giới hạn, matching values suppressed |
| Dependency audit | **Fail** | 2 high qua Expo/Metro, chưa upstream patched; xem [security](security.md) |
| Live GitLab read/OAuth exchange/refresh | Not run | Read runner đã trả exit 2 / NOT RUN; chưa sandbox/token/Application ID được cung cấp |
| Native signed build / iPhone cable | Not run | Native runner đã trả exit 2 / NOT RUN; người dùng tự build trên Mac/Xcode/iPhone |
| Android native/device | Not run | Chưa device/toolchain validation |
| Log/artifact native cap/redirect/checksum | Not run, feature khóa | JS unit không chứng minh native buffer bound |
| Real webhook/APNs/FCM/push routing | Not run | Chưa service deploy/signing/provisioning |
| Performance/7-day soak/biometrics/backup | Not run | Không suy ra từ fake clock hoặc bundle |
| Apple Developer publish | Ngoài đợt này | Giai đoạn khác theo yêu cầu người dùng |

Final exact checks/counts được ghi trong [delivery report](../plans/reports/implementation-261004-1903-current-plan.md). Chỉ dùng evidence tương ứng revision cuối.

## Checklist cho lần chạy iPhone

1. Build/install qua cáp và mở app; thử font scaling, dark mode, keyboard, safe areas, VoiceOver/touch targets.
2. PAT read-only hoặc OAuth public-client trên sandbox: callback exact/state/deny/cancel/warm/cold; relaunch; expiry/refresh không mở browser; mất mạng không tự xóa phiên.
3. Switch/logout/lock trong lúc GET/refresh đang chạy; không còn dữ liệu/draft của account cũ; kiểm tra Keychain reinstall/backup/device migration và Face ID thay đổi/canceled.
4. Read projects nhiều trang/filter; repository Unicode/slash paths, binary/large file; issues comment/metadata và MR revisions/diffs/resolve/approve/merge policy rejects.
5. Chỉ dùng non-production policy đã thử: pipeline failure → log → retry ID mới; run/ref SHA changes; cancel chưa terminal; manual/delayed/archived jobs; kill process sau dispatch và journal restore không replay.
6. Native transport PoC trong [development](development.md) trước khi bật flag: cap/abort/memory/redirect no credential leak/checksum/quota/share cleanup.
7. Schedules timezone/DST/ownership/next run; environment nullable deployable, stop on_stop không force; production/rollback chỉ sau policy và mandatory safety gates thật.
8. Nếu provision push: receiver spoof/signature/dedup/permission/lease, device reinstall/token rotation, cold/warm/background tap, wrong account/stale event/offline logout và service outage.
9. Đo Home shell/data P95/API latency/memory/render/network/battery trên device/network thật; soak ít nhất 7 ngày thật và ghi tách biệt fake-clock 30 ngày.

Không tick các bước này chỉ vì source hoặc fixtures đã tồn tại. Release gates theo [release guide](release.md) vẫn còn mở.
