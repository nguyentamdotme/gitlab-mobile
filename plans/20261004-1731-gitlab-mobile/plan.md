---
title: "GitLab Mobile — kịch bản sản phẩm và kế hoạch triển khai"
description: "App React Native tương tác GitLab qua API, duy trì phiên an toàn và ưu tiên vận hành CI/CD trên điện thoại."
status: in-progress
priority: P2
effort: "360h / 45 ngày công, chưa gồm thời gian chờ hạ tầng và duyệt store"
branch: agent-01M43ZGEXHB536RMF24NZK6T0E
tags: [feature, frontend, backend, api, auth]
blockedBy: []
blocks: []
created: 2026-10-04
---

# GitLab Mobile: kịch bản hoàn chỉnh và implementation plan

## 1. Kết quả cần đạt

Xây dựng app iOS/Android để xem project, xử lý issue/Merge Request (MR), theo dõi và vận hành CI/CD qua GitLab REST API v4. Người dùng mở app và thao tác nhanh, không phải thường xuyên đăng nhập lại trên website GitLab.

**Quyết định đề xuất:** React Native + Expo + TypeScript; OAuth 2.0 Authorization Code với PKCE; GitLab access/refresh token lưu trên thiết bị; app gọi trực tiếp GitLab. Bổ sung backend nhỏ riêng cho webhook và push notification khi cần nhận cảnh báo lúc app đóng.

Đây là plan thiết kế và acceptance contract. Source mobile/service đã được triển khai trong đợt thực thi; xem [report implementation và giả định](../reports/implementation-261004-1903-current-plan.md) cùng [verification results](../../docs/verification-results.md). File/module cụ thể đã được gộp theo boundary thực tế; không phải mọi tên file dự kiến bên dưới đều được tạo riêng. Chưa có native signed build/device/live GitLab/push hoặc deploy backend; plan còn in-progress.

### Giả định để có thể lập kế hoạch ngay

- “ReactJS mobile” được hiểu là React Native, không phải React web/PWA. Kiến thức React được tái sử dụng nhưng UI dùng native components, không dùng HTML/DOM.
- Hỗ trợ source Android/iOS; ưu tiên iPhone qua cáp theo quyết định người dùng lúc thực thi. Publish Apple Developer ở giai đoạn khác. Tiếng Việt mặc định.
- GitLab.com là cấu hình mặc định; GitLab Self-Managed qua HTTPS/VPN cũng được hỗ trợ với OAuth client riêng cho từng instance.
- Baseline dự kiến: GitLab 17.0+ cho tính năng lõi; xác nhận bản thấp nhất cần hỗ trợ ở phase 01. Không mặc định GitLab mới nhất hoặc gói Ultimate.
- Nhóm nhỏ/cá nhân là đối tượng ban đầu; một tài khoản đang hoạt động tại một thời điểm nhưng dữ liệu và phiên luôn phân tách theo instance + user.
- Có quyền Developer để thử CI; Maintainer/Owner phụ trách cấu hình webhook và protected environment khi cần. API của GitLab quyết định quyền cuối cùng.
- Không cam kết phiên “vĩnh viễn”, không vượt SSO/2FA hoặc chính sách của tổ chức.

## 2. Kịch bản sử dụng end-to-end

### A. Lần sử dụng đầu tiên: kết nối GitLab

1. Mở app, chọn GitLab.com hoặc nhập địa chỉ Self-Managed; hiển thị hostname rõ ràng trước khi gửi credentials.
2. Với Self-Managed, chọn cấu hình OAuth client do tổ chức cung cấp hoặc nhập Application ID. Không nhập Client Secret.
3. Chọn “Kết nối GitLab”. App mở phiên xác thực của trình duyệt hệ thống, không dùng WebView để thu mật khẩu.
4. Người dùng login GitLab, hoàn tất SSO/2FA và đồng ý quyền API. Nếu trình duyệt đã có phiên GitLab, có thể không phải nhập lại mật khẩu.
5. GitLab trả authorization code qua link quay về app; app kiểm tra `state`, PKCE và đổi code lấy token.
6. App xác định user qua `/user`, lưu phiên trong SecureStore, tải project rồi mời ghim project thường dùng.
7. Chọn khóa app bằng sinh trắc học/device credential nếu muốn. Không hỏi quyền notification trước khi người dùng hiểu lợi ích.

**Một lần xác thực GitLab ban đầu vẫn cần thiết.** Sau đó phần lớn thao tác dùng UI native và API; không cần duyệt giao diện web GitLab. Nếu tổ chức không cho đăng ký OAuth, PAT là phương án tương thích do người dùng tự tạo; không lưu mật khẩu, không giả định PAT tự gia hạn.

### B. Mở app hằng ngày

1. Mở thẳng Home của tài khoản trước đó; nếu có khóa app thì xác thực cục bộ.
2. Hiển thị project ghim, pipelines đang chạy/thất bại, MR được giao review và issue của tôi.
3. Khôi phục token; refresh nếu cần trước khi gọi API. Không refresh liên tục khi app đóng.
4. Dữ liệu đã tải trong phiên hiện tại xuất hiện nhanh; có thời điểm cập nhật rõ ràng. Có mạng thì tải lại; mất mạng thì hiển thị “đang offline”, không chuyển thành logout.
5. Chọn project hoặc mục cần xử lý, không phải đi lại từ màn hình login.

### C. Pipeline thất bại khi đang đi ngoài đường

1. Mở Home hoặc chạm cảnh báo push nếu đã bật dịch vụ notification.
2. Mở pipeline: project, branch/tag, commit SHA, người chạy, trạng thái, thời gian, stage/job và downstream pipeline nếu có quyền.
3. Chạm job đỏ, xem `failure_reason`, runner metadata và log; tìm từ khóa, chuyển về cuối log, copy đoạn được người dùng chọn.
4. Chọn “Retry job” nếu lỗi có thể thử lại; hoặc “Retry failed/canceled jobs” ở pipeline. Xác nhận đúng đối tượng rồi gửi API.
5. App lấy job ID mới sau retry, tải lại trạng thái pipeline. Khi đang xem, polling cập nhật tới trạng thái kết thúc.
6. Nếu lỗi cần sửa code: xem commit/MR liên quan, comment ngắn hoặc tạo issue kèm liên kết; không tự sửa và push code lên repository.

### D. Chủ động chạy pipeline

1. Project → CI/CD → “Run pipeline”. Chọn branch/tag từ API, không chỉ nhập chuỗi tùy ý.
2. Nhập pipeline inputs nếu instance và CI config hỗ trợ; nếu không, dùng variables được phép theo chính sách project.
3. App hiện project, ref, SHA hiện tại, inputs/variables và cảnh báo môi trường đích nếu biết. Giá trị nhạy cảm không lưu vào lịch sử/template/analytics.
4. Xác nhận → tạo pipeline → chuyển tới pipeline mới. Nếu ref đổi trong lúc xác nhận, thông báo SHA thực tế của pipeline.
5. Nếu kết nối mất sau khi gửi lệnh, trạng thái là “chưa xác định”; đọc lại danh sách trước khi cho chạy lại, không tự POST lần hai.

### E. Deploy staging/production có kiểm soát

1. Pipeline → job manual hoặc Environments → deployment liên quan.
2. App hiển thị environment, job, branch, SHA và quyền dự kiến. Không suy luận deploy chỉ từ tên job.
3. Đọc lại trạng thái và xác nhận; production yêu cầu xác thực cục bộ bổ sung và xác nhận rõ ràng. Job thiếu metadata environment không tự gọi là staging. Production/môi trường chưa phân loại chỉ mở sau phase 05 policy + safety gates; mốc nội bộ phase 04 luôn khóa chúng.
4. App gọi `jobs/:job_id/play`; GitLab vẫn áp dụng protected branch/environment, approval, freeze và CI rules.
5. Theo dõi job, log, deployment status và external URL. Nếu approval cần thiết, hiển thị trạng thái chờ; API approval chỉ bật khi tier/quyền hỗ trợ.
6. App **không tạo deployment record để giả lập deploy** và không vượt các bước bảo vệ GitLab.

### F. Redeploy/rollback

Chọn deployment cũ → xem SHA/artifacts/job cũ → app chỉ cung cấp redeploy nếu project đã có quy trình được cấu hình và kiểm thử. Có thể retry deployment job cũ hoặc chạy pipeline rollback chuyên dụng với inputs cho revision mục tiêu. **Không hứa rollback database hoặc hạ tầng bằng API GitLab chung.** Nếu chưa có quy trình, nút bị vô hiệu hóa và giải thích lý do.

### G. Review Merge Request

Danh sách “cần tôi review” → MR detail → xem diff theo file, CI status, discussions → comment/reply/resolve khi có quyền → approve đúng head SHA. Nếu head đã đổi, yêu cầu tải lại. Merge là thao tác do người dùng xác nhận, kiểm tra lại SHA/trạng thái và tuân thủ project policy; không tự động merge hoặc bypass checks. Trường hợp SAML/approval reauthentication không hỗ trợ an toàn thì mở link GitLab như ngoại lệ, không thu password trong app.

### H. Quản lý issue và repository

Xem/tìm project, branch/tag, commit, file read-only. Issue: tạo, comment, gán người xử lý/label nếu đủ quyền, đóng/mở lại. Lưu draft comment trong bộ nhớ khi mạng yếu; gửi lại phải do người dùng quyết định để tránh trùng. MR có thể tạo từ branch đã có; không có editor code hoặc Git clone trên điện thoại trong phiên bản này.

### I. Pipeline schedules và thông báo

Xem schedule → cron + timezone + ref + owner + lần chạy → tạo/sửa/bật-tắt/chạy ngay khi có quyền → xác nhận trước thay đổi. Chạy ngay không đổi lần chạy kế tiếp. Watch project → quản trị viên cài webhook → backend nhận event → gửi thông báo tối giản → chạm để mở app và đọc lại trạng thái/quyền từ GitLab. Không cần giữ app chạy nền liên tục.

### J. Logout, token thu hồi, chuyển tài khoản

Logout: ngừng request/polling, xóa credentials/cache/file tạm, bỏ subscription của thiết bị và best-effort revoke token theo loại auth. Logout offline vẫn xóa dữ liệu cục bộ, nhưng không được báo “đã thu hồi tại GitLab” khi chưa làm được. Có hướng dẫn revoke từ GitLab. Token bị thu hồi hoặc refresh không còn hợp lệ: giữ lựa chọn instance, yêu cầu reconnect rõ ràng. Chuyển tài khoản: hủy request cũ, thay namespace cache/credentials, không hiện project hay notification của tài khoản khác.

## 3. Màn hình và phạm vi tính năng

Điều hướng chính: **Home · Projects · CI/CD · Inbox · Settings**. Project detail có tab Overview, Repository, Issues, Merge Requests, Pipelines, Environments, Schedules.

| Nhóm | Bản dùng sớm: phases 01–04 | Bản đầy đủ: phases 05–07 |
|---|---|---|
| Kết nối | OAuth PKCE, restore/refresh, Self-Managed, PAT fallback, app lock, account isolation | Hardening thiết bị, multi-device tests |
| Home/Projects | Project ghim, search, pagination, branch/tag/commit/file read-only | Dashboard MR/issue đầy đủ, deep links |
| Issues | List/detail/create/comment/đóng-mở | Assign/labels và UX review |
| Pipelines | List/filter/detail, run/retry/cancel, stage/jobs/downstream | Test report, pipeline inputs tương thích |
| Jobs | Trace polling, retry/cancel/manual play trong non-production allowlist, artifact download | Mở production sau policy/safety gates và thử artifact lớn |
| MR | Liên kết/status phục vụ chẩn đoán CI | List/create/diff/discussions/approve/unapprove/merge có xác nhận |
| CI nâng cao | Trạng thái environment cơ bản nếu job cung cấp | Environments/deployments, schedule CRUD/play, CI lint, rollback có cấu hình |
| Thông báo | In-app refresh khi đang mở | Push khi đóng app qua webhook backend |

**Không thuộc phiên bản này:** full IDE/Git clone, runner administration, terminal interactive, chỉnh CI secrets/variables cấp project/group, xóa pipeline/log/artifacts, Kubernetes console, quản trị toàn bộ GitLab. Inputs/variables lúc chạy pipeline khác với quản lý kho secrets CI. Các mục này không bị âm thầm đưa vào scope.

## 4. Kiến trúc đề xuất

### Mobile gọi GitLab trực tiếp

- Expo development builds, Expo Router, React Native + TypeScript. Không dùng Expo Go để kết luận auth/push hoạt động.
- `expo-auth-session` + `expo-web-browser` cho PKCE/system browser; `expo-secure-store` cho credentials; `expo-local-authentication` cho khóa cục bộ.
- TanStack Query cho server state, phân trang, invalidation; React Context/reducer cho account/session/UI state. Chưa cần Redux hoặc Zustand.
- HTTP layer dùng `fetch` với timeout, AbortController, auth injection, concurrency limit, typed adapters và runtime validation tại các response quan trọng.
- Expo FileSystem + Sharing cho artifacts; notification module khi phase 06 được bật.
- Jest + React Native Testing Library; Maestro cho E2E native; contract tests dựa trên fixtures phiên bản GitLab mục tiêu.
- Chọn Expo SDK stable tại phase 01 rồi pin toolchain/lockfile và dùng dependency versions tương thích; không chọn số version theo trí nhớ. Dependency thực tế được quản lý bằng workspace manifests/lockfile; xem development docs.

Các module dự kiến: `apps/mobile/src/core/auth`, `core/gitlab`, `core/security`, `core/storage`, `features/projects`, `issues`, `merge-requests`, `pipelines`, `jobs`, `environments`, `schedules`, `notifications`. Route thực tế nằm trong `apps/mobile/src/app`; model dùng chung không chứa secret nằm trong `packages/contracts`.

### Backend chỉ dành cho notification

Luồng: **GitLab project webhook → HTTPS receiver → PostgreSQL event/outbox → worker → Expo Push Service → APNs/FCM → điện thoại**.

Backend TypeScript + Fastify, một PostgreSQL; outbox worker có retry/dedup, chưa thêm Redis/microservices. Backend không chạy pipeline thay người dùng, không giữ GitLab refresh token, không sao chép source/log/artifacts. App vẫn vận hành được khi backend notification hỏng hoặc không được triển khai.

GitLab Self-Managed phải gọi ra receiver và điện thoại phải vào được GitLab (có thể cần VPN). Nếu receiver không truy cập được instance để kiểm chứng user/project thì không hỗ trợ push cho instance đó; các API trực tiếp trên điện thoại vẫn có thể hoạt động.

## 5. Đăng nhập lâu dài, nhưng an toàn

**Chọn OAuth PKCE, không dùng password grant/implicit grant.** PKCE S256 cho public/non-confidential client; không có client secret trong app, `.env` mobile hay bundle. Application ID không phải bí mật có thể giấu trong ứng dụng public. Đăng ký OAuth app riêng theo instance; bắt buộc PoC exchange + refresh không cần secret.

- Chế độ tương tác mặc định xin `api`, vì GitLab không có scope riêng hẹp cho retry/deploy/comment. Consent phải giải thích đây là quyền API rộng trong phạm vi quyền user. Chế độ chỉ đọc có thể dùng `read_api` + `read_user`, phải reconnect nếu muốn ghi.
- Production ưu tiên HTTPS Universal Links/App Links với domain sở hữu và liên kết ứng dụng được xác minh; development dùng app scheme riêng. Redirect URI phải khớp chính xác cấu hình GitLab. Không dùng OAuth proxy công cộng để giữ token.
- Access token thường mặc định sống **2 giờ**, nhưng luôn đọc `created_at`/`expires_in` từ response vì instance có thể cấu hình khác.
- Refresh khi mở lại app hoặc trước request nếu còn dưới 60 giây; chỉ một refresh đồng thời cho mỗi account. Không cần background timer để “giữ login”.
- GitLab refresh trả cặp access/refresh mới và vô hiệu cặp cũ: lưu cả cặp trong một credential record có generation; chờ lưu thành công trước khi phát token cho các request đang đợi.
- Credential record dùng SecureStore, không AsyncStorage, query persistence, console log hoặc crash report. Không lấy local token làm nguồn xác định quyền GitLab.
- Phân biệt mạng lỗi/429/5xx với `invalid_grant`: không logout vì mất mạng, không retry refresh cũ mù quáng nếu server có thể đã xoay token.
- Nếu app chết/response mất sau refresh đã thành công phía GitLab nhưng chưa lưu được token mới, reconnect có thể là cách phục hồi duy nhất. Không hứa loại bỏ rủi ro này bằng “atomic transaction” giữa điện thoại và GitLab.
- API 401: tối đa một refresh và một retry cho GET; lệnh ghi không tự resend. Refresh thành công không có nghĩa user có thêm quyền; 403 không phải lý do refresh.
- Tùy chọn app lock và step-up cho thao tác rủi ro. Sinh trắc học cục bộ không thay thế GitLab authorization/approval. Nếu dùng SecureStore `requireAuthentication`, test prompt trên refresh/save và key bị vô hiệu khi đổi biometrics; không bật mặc định một cấu hình chưa kiểm chứng gây hỏi Face ID mỗi request.
- Phát hiện cài lại app qua marker không restore và xóa credentials mồ côi; không giả định uninstall iOS luôn xóa Keychain. Android backup loại trừ credentials.
- PAT fallback: nhập kín, lưu SecureStore, dùng auth header phù hợp, hiển thị expiry nếu xác định được; không có OAuth refresh. Khi hết hạn cần token mới, không xin token “không bao giờ hết hạn”.

**Mục tiêu UX:** người dùng vẫn có thể mở và sử dụng sau nhiều ngày/tuần mà không login lại, miễn grant còn hợp lệ và chính sách instance cho phép. Kiểm thử giả lập thời gian và một đợt soak thực tế; không cam kết số ngày phiên vượt chính sách máy chủ.

## 6. Hợp đồng mạng, dữ liệu và an toàn thao tác

- Prefix GitLab: `{instanceBaseUrl}/api/v4`; OAuth không nằm trong `/api/v4`. Hỗ trợ Self-Managed có subpath; normalize URL, HTTPS, port/path, không chấp nhận URL userinfo/query/fragment và không gửi credentials sang hostname khác.
- Namespace tài khoản: instance origin + base path + GitLab numeric user ID. Key SecureStore dùng encoding/hash hợp lệ; query keys mang account namespace. Project numeric ID, MR/issue dùng project-scoped IID.
- Chỉ theo pagination URL cùng origin/base path hợp lệ; không coi `Link`, avatar, external URL hay artifact redirect là endpoint được phép mang bearer token.
- Pin project và UI preferences có thể persist dưới namespace. **MVP không persist nội dung private repository, log, MR/issue vào storage không mã hóa**; query cache chỉ RAM. Khi app bị kill, offline chỉ có preferences/metadata không nhạy cảm, không hứa đọc lại source/log offline.
- Dữ liệu lệnh ghi không optimistic-success. Vô hiệu nút khi gửi, đọc lại trạng thái trước thao tác nhạy cảm; production luôn có confirm và app lock/step-up.
- Lệnh POST/PUT có timeout hoặc process death sau dispatch là kết quả chưa xác định: trước gửi lưu intent metadata tối thiểu trong SecureStore, sau restart restore/reconcile qua GET, không auto retry hoặc tự queue để chạy lúc có mạng. Journal không chứa body/variables/token, có size bound và được xóa khi logout/kết quả đã xác định. Không giả định GitLab hỗ trợ idempotency key cho mọi endpoint.
- Mốc nội bộ phase 04 khóa mọi CI mutation ngoài project/job/ref non-production allowlist đã xác nhận; production/môi trường chưa phân loại cần policy phase 05 và safety gates, không chỉ confirmation.
- 403: giải thích thiếu quyền/protected policy; 404: có thể mất quyền hoặc resource bị xóa, không kết luận chắc “feature không hỗ trợ”; 409: tải lại revision; 429: tôn trọng Retry-After; 5xx: GET backoff có giới hạn.
- Dashboard tổng hợp từ project ghim, tối đa 10 project với concurrency ban đầu 3; không bắt buộc global `/pipelines` mới chỉ có ở các GitLab gần đây. Có “load more”, không âm thầm bỏ dữ liệu.
- Pipeline/job đang chạy: polling 5–10 giây trên màn hình đang active; dashboard 30–60 giây; dừng khi background, offline, mất focus hoặc trạng thái terminal. Backoff khi lỗi/429.
- Trace API trả file text, không SSE/WebSocket guarantee. View log giới hạn buffer ~1 MiB và virtualize dòng; nếu downloader không enforce được giới hạn byte trong transport native, không auto-poll trace lớn, dùng tải file theo yêu cầu. Không hứa HTTP Range/incremental fetch nếu chưa chứng minh trên instance.
- Artifacts tải binary vào app sandbox, kiểm tra dung lượng/quota và expiry; redirect cross-origin phải bỏ Authorization/PRIVATE-TOKEN. Không đưa GitLab token vào URL cho browser/download manager. Export/share chỉ khi user xác nhận vì file có thể chứa dữ liệu nhạy cảm; dọn file tạm lúc logout/expiry và trong startup cleanup.
- Markdown/diff/ANSI render như dữ liệu không tin cậy: không chạy HTML/script/escape commands; link external không nhận credentials. Log có thể chứa secret dù GitLab đã mask; không hứa regex app sẽ redaction hoàn hảo.

## 7. Roadmap và nghiệm thu từng giai đoạn

Ước lượng cho **1 lập trình viên React Native/TypeScript có kinh nghiệm**, QA/review hỗ trợ một phần. Ngày là ngày công 8 giờ, chưa gồm tài khoản developer/store, chứng chỉ, mua thiết bị, VPN, approvals tổ chức và thời gian duyệt store. Backend, policy phức tạp hoặc bản GitLab cũ có thể tăng chi phí; ước lượng được cập nhật sau PoC.

| Phase | Đầu ra | Phụ thuộc | Ước lượng |
|---|---|---|---:|
| [01 — Foundation](phase-01-foundation.md) | Toolchain, skeleton, fixtures, feasibility probes | Không | 3 ngày |
| [02 — Auth/session](phase-02-auth-session.md) | OAuth/PAT, refresh/restore, storage/lock, isolation | 01 | 6 ngày |
| [03 — Workspace](phase-03-workspace.md) | Home/projects/repository/issues, HTTP/query foundation | 02 | 5 ngày |
| [04 — CI core](phase-04-ci-core.md) | Pipeline/job/log/artifacts/run/retry/cancel/play | 03 | 9 ngày |
| [05 — Review + CI advanced](phase-05-review-ci-advanced.md) | MR review, schedules, environments, deploy/rollback, lint | 04 | 8 ngày |
| [06 — Notifications](phase-06-notifications.md) | Webhook receiver, secure subscriptions, background push | 02 + 04; integration sau 05 | 7 ngày |
| [07 — Hardening/release](phase-07-release.md) | Real-device security/E2E, CI cho app, release guide | 01–06 | 7 ngày |
| **Tổng** | App đầy đủ + notification service | | **45 ngày / 360 giờ** |

Mốc 1: sau phase 04, khoảng **23 ngày công**, bản nội bộ dùng được với CI lõi trong non-production allowlist, chưa có background push hoặc MR review đầy đủ. Auth/mutation/account-isolation/redirect safety gates là **bắt buộc trước mốc này**, không chờ phase 07. Mốc 2: sau phase 05, **31 ngày công**, hoàn tất luồng tương tác; production chỉ mở sau policy/gates đạt. Mốc 3: sau phase 07, **45 ngày công**, đủ kiểm chứng signed release candidate để phát hành có kiểm soát. Phase 06 không bắt buộc cho mốc 1 nhưng **có trong tổng scope**, không bị bỏ khỏi bản đầy đủ.

Mỗi phase liệt kê file dự kiến tạo, checklist tasks, failure handling và test gate. Hợp đồng endpoint: [API contract](api-contract.md).

## 8. Definition of Done và chiến lược kiểm thử

- Phiên restore qua restart; refresh sau hết access token mà không mở browser; 20 request đồng thời chỉ tạo một refresh/account; logout lúc refresh đang chạy không hồi sinh phiên.
- Callback state sai, host mismatch, code reuse và canceled consent không tạo phiên; bundle không có client secret/PAT; credential không có trong log, crash report, URL, backup và storage thường.
- GitLab.com và ít nhất một Self-Managed mục tiêu; role Viewer/Reporter, Developer, Maintainer; non-production/protected environment; Free và feature Premium được test hoặc ghi rõ chưa có license kiểm chứng.
- CI core test đủ pipeline statuses, manual/delayed/blocked/canceling/unknown, retried job ID mới, downstream khác project, ref thay đổi, pipeline rules từ chối và variable policy.
- Không trùng lệnh khi double tap, 401, timeout, reconnect, process death; action chưa rõ kết quả không tự chạy lại.
- Trace/artifact 404/expired/redirect/file lớn, binary correctness, memory bound; không lộ token sang CDN/avatar/external URL.
- Webhook forged/duplicate/out-of-order, invalid signature/token, permission revocation, logout offline, cross-account routing, expired subscription và DeviceNotRegistered không làm lộ dữ liệu hoặc gửi lệnh GitLab. Worker kiểm tra lease/revocation trước mỗi send/retry; push đã vào OS queue có thể đến muộn, payload luôn opaque.
- Unit + integration với fixtures và clock/network mocks; live contract read-only mặc định. Test write chỉ dùng sandbox project/CI jobs không chạm production, có sự chấp thuận của người quản lý project.
- E2E native Android và iOS trong quá trình development; release gate bắt buộc **signed release candidate** trên ít nhất một điện thoại thật mỗi nền tảng cho auth/deep links/lock/log/artifacts/push. Dev-only evidence không đủ; không dùng Playwright web để thay cho validation native.
- Mục tiêu performance dự kiến: Home preferences/shell P95 ≤2 giây và data page đầu ≤3 giây trên thiết bị/network tham chiếu được chốt ở phase 01; đo riêng API latency, không hứa cho mọi VPN/instance. Refresh access token không mở browser; chưa đo thì không báo đã đạt.
- Build release, dependency/security scan, hướng dẫn connect/revoke/reset, privacy policy/data retention, store compliance; deployment/store submission cần phê duyệt riêng.

## 9. Rủi ro và quyết định cần xác nhận trước code

| Rủi ro | Cách xử lý |
|---|---|
| OAuth client/redirect chưa có | PoC ưu tiên ở phase 01–02; cần domain production và người đăng ký application |
| GitLab version/tier khác docs mới nhất | Capability matrix theo version + quyền + feature policy; read probes an toàn, không POST để dò |
| Long login bị thu hồi/SSO chặn | Reconnect có hướng dẫn; không bypass policy; offline không coi là invalid auth |
| Refresh rotation bị mất response | Single-flight, durable save, detect uncertain state; chấp nhận có trường hợp phải reconnect |
| Retry/deploy vô tình chạy trùng hoặc sai environment | Confirmation, step-up, no automatic write retry, reread state, sandbox tests |
| Trace/ZIP quá lớn hoặc token lộ qua redirect | Native transport PoC, byte/quota limits; fail closed nếu downloader không bảo vệ được |
| Notification đến user đã mất quyền | Payload opaque không có project/log/status; subscription lease ngắn; revalidate GitLab khi mở event |
| Self-Managed private chỉ vào được bằng VPN | UI network guidance; push chỉ khi webhook/verification backend reachability đạt |

Người dùng đã cho phép bỏ human-gate và chọn giả định phù hợp dự án; toàn bộ câu hỏi/assumed answers được ghi trong delivery report. iPhone local build là ưu tiên hiện tại; Apple Developer publish để sau. Instance/sandbox/OAuth/policy/hosting chưa được cung cấp không được thay bằng dữ liệu giả hoặc suy ra đã kiểm chứng. Secret/token không gửi trong chat hoặc plan.

## 10. Nguồn chính thức và mức kiểm chứng

Đối chiếu ngày 2026-10-04; GitLab Docs hiện hành có cả endpoints/features mới hơn baseline. Baseline/version compatibility phải được test trên instance thực tế.

- [GitLab OAuth API, PKCE và refresh rotation](https://docs.gitlab.com/api/oauth2/)
- [GitLab OAuth provider, scopes và expiry](https://docs.gitlab.com/integration/oauth_provider/)
- [Pipelines API](https://docs.gitlab.com/api/pipelines/) · [Jobs API](https://docs.gitlab.com/api/jobs/)
- [Artifacts API](https://docs.gitlab.com/api/job_artifacts/) · [Schedules](https://docs.gitlab.com/api/pipeline_schedules/)
- [Environments](https://docs.gitlab.com/api/environments/) · [Deployments](https://docs.gitlab.com/api/deployments/)
- [MR API](https://docs.gitlab.com/api/merge_requests/) · [Approvals](https://docs.gitlab.com/api/merge_request_approvals/) · [Discussions](https://docs.gitlab.com/api/discussions/)
- [CI lint](https://docs.gitlab.com/api/lint/) · [Project webhooks](https://docs.gitlab.com/api/project_webhooks/) · [Metadata](https://docs.gitlab.com/api/metadata/)
- [Expo authentication/development builds](https://docs.expo.dev/guides/authentication/) · [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) · [Push overview](https://docs.expo.dev/push-notifications/overview/)

### Validation log

Bản lập plan ban đầu xác nhận repo greenfield và đối chiếu OAuth/CI docs. Đợt implementation đã tạo workspace/source/scripts và chạy các check được ghi trong report; các đường dẫn thiết kế không phải inventory hiện tại. Chưa kiểm chứng tài khoản thật/native signed build/device. Checklist source và fixtures không thay native acceptance gate.

### Rà soát độc lập và consistency sweep

Đã rà soát theo bốn góc nhìn: security, assumptions/API, failure handling và scope. Các điểm bổ sung vào bản cuối:

- Pending mutation journal metadata-only để process death không dẫn đến gửi lệnh CI lần hai; đồng bộ phase 04, API contract và DoD.
- Worker kiểm tra subscription lease/revocation trước từng lần send/retry; công bố giới hạn không thu hồi được push đã tới OS queue; đồng bộ phase 06 và DoD.
- Signed release candidate trên thiết bị thật là release gate, development-only evidence không đủ; đồng bộ phase 07 và DoD.
- Safety gates bắt buộc từ mốc nội bộ; khóa production/unknown environment trước phase 05 policy; đồng bộ roadmap, feature matrix, scenarios, phase 04–05–07 và API contract.

Cần kiểm chứng PoC/live/device vẫn được giữ là gate tương lai; không biến review tài liệu thành claim runtime success. Không có task-management connector được sử dụng; checklist phase là backlog thực thi. Chưa tạo issue, commit, push hoặc triển khai app.
