# Start, build local và cài lên iPhone qua cáp

Hướng dẫn này dành cho việc tự chạy app trên iPhone của bạn. Signing để cài lên thiết bị thực hiện trong Xcode; publish Apple Developer/TestFlight/App Store thuộc [giai đoạn release riêng](release.md).

## Chuẩn bị máy và iPhone

- Dùng **Mac** có Xcode và iOS platform tools tương thích với [Expo SDK đang pin](../apps/mobile/package.json). Theo [SDK 57 matrix](https://docs.expo.dev/versions/v57.0.0/), cần Xcode 26.4+ và iPhone iOS 16.4+; macOS phải chạy được phiên bản Xcode đó. Linux/Windows dùng được các check JavaScript, không compile/sign iOS local.
- Cài Node 24 và pnpm theo `packageManager` trong [root manifest](../package.json). Nếu chưa có pnpm: `npm install -g pnpm@12.9.1`. Cài CocoaPods theo [Expo local build setup](https://docs.expo.dev/guides/local-app-development/), mở Xcode lần đầu để hoàn tất cài tools/license.
- Thêm Apple Account của bạn trong Xcode → Settings → Accounts. **Personal Team** cho phép cài thử trên thiết bị cá nhân; provisioning có giới hạn và phải gia hạn bằng build/install lại. Chi tiết do [Apple quản lý](https://developer.apple.com/help/account/basics/about-your-developer-account).
- Cắm iPhone vào Mac, unlock, chọn **Trust This Computer**. Mở Xcode → Window → Devices and Simulators và chờ thiết bị Ready. Bật **Settings → Privacy & Security → Developer Mode**, restart và xác nhận trên iPhone theo [hướng dẫn Expo](https://docs.expo.dev/guides/ios-developer-mode/). Nếu chưa thấy tùy chọn, pairing thiết bị với Xcode trước.

Các lệnh dưới chạy tại repository root. Không cần notification backend để dùng GitLab API.

## Cài dependency và kiểm tra local

```bash
pnpm install --frozen-lockfile
pnpm verify
```

`verify` kiểm tra TypeScript, lint và unit tests; không tạo app native. Để kiểm tra riêng JS bundle iOS:

```bash
pnpm --filter mobile bundle:ios
```

Bundle trong `apps/mobile/dist` không phải file cài lên iPhone. Các check đã thực sự chạy và giới hạn nằm trong [verification results](verification-results.md).

## Build và cài lần đầu bằng CLI

Kiểm tra `lsof -i :8081` trên Mac trước khi chạy; nếu Metro của cùng project đã chạy, dùng flow tái sử dụng ở phần dưới. Không mở thêm Metro ở port khác.

```bash
pnpm --filter mobile ios
```

Chọn iPhone vật lý của bạn trong danh sách. Script gọi Expo native build với `--device`: sinh `ios/` nếu chưa có, cài pods, compile, install app rồi khởi động Metro. Lần đầu có thể cần chọn development team; nếu signing lỗi hoặc CLI chưa chọn được team, dùng Xcode flow tiếp theo. Quy trình build/device flags được mô tả trong [Expo local compilation](https://docs.expo.dev/guides/local-app-development/).

Cáp dùng để cài/debug native. Bản Debug còn cần iPhone truy cập Metro của Mac: thường dùng cùng Wi-Fi, cho phép Local Network khi iOS hỏi và cho phép kết nối qua firewall Mac. Cáp không tự bảo đảm iPhone truy cập được địa chỉ Metro. Mở app development build đã cài và chọn server của project trong dev client.

Nếu đã có Metro đúng project ở 8081, build/install mà không tạo server thứ hai:

```bash
pnpm --filter mobile exec expo run:ios --device --no-bundler --port 8081
```

## Build và cài bằng Xcode

Sinh native project và cài pods trên Mac:

```bash
pnpm --filter mobile prebuild:ios
open apps/mobile/ios/GitLabMobile.xcworkspace
```

Mở **`.xcworkspace`**, không mở riêng `.xcodeproj`. Tên workspace được sinh theo app name; nếu đổi tên app, xem tên thật trong `apps/mobile/ios/`.

1. Chọn project **GitLabMobile**, target app → **Signing & Capabilities**.
2. Bật **Automatically manage signing**, chọn đúng **Team** của bạn. Giữ Bundle Identifier khớp [app config](../apps/mobile/app.config.ts).
3. Chọn scheme app và run destination là iPhone đã pairing; chờ Xcode hoàn tất device preparation.
4. Start Metro theo phần dưới nếu chưa chạy; nhấn **Run** (`⌘R`) để build, sign, install và mở app.
5. Nếu iOS yêu cầu trust developer, làm theo thông báo trong **Settings → General → VPN & Device Management**, rồi mở app lại. Không cài profile từ nguồn khác để chữa lỗi signing.

Bundle ID mặc định có thể đã được đăng ký bởi người khác. Khi cần ID riêng, cấu hình public trước khi prebuild:

```bash
export EXPO_PUBLIC_IOS_BUNDLE_ID=com.yourname.gitlabmobile
pnpm --filter mobile prebuild:ios
```

Thay `com.yourname.gitlabmobile` bằng ID duy nhất của bạn. Giữ cùng biến trong shell khi start/build. Không đặt GitLab PAT, OAuth secret hoặc signing key vào `EXPO_PUBLIC_*`: các giá trị đó đi vào app/config public.

`ios/` và `android/` là output CNG bị gitignore. Native config bền vững nằm trong `app.config.ts` và plugins; chọn signing team trong Xcode là cấu hình local cho thiết bị. Prebuild `--clean` xóa project native sinh ra, gồm cả chỉnh signing local; chỉ dùng khi chủ động regenerate và chọn team lại. Sau khi đổi native dependency/plugin/config, prebuild và rebuild, không chỉ reload JS.

## Start app khi làm việc hằng ngày

Sau khi development build đã được cài, đổi TypeScript/React thường chỉ cần Metro:

```bash
pnpm --filter mobile start
```

Script dùng port 8081 và development client. Mở app đã cài trên iPhone, chọn server của project; Fast Refresh nhận thay đổi JS. Dùng `Ctrl+C` để stop Metro khi xong. Nếu port bận, xác định PID/project bằng `lsof -i :8081`; chỉ dừng process do bạn sở hữu hoặc tái sử dụng server đúng project.

## Build Release local để chạy không cần Metro

Trước tiên hoàn tất signing và chạy Debug thành công. Sau đó có thể dùng:

```bash
pnpm --filter mobile exec expo run:ios --device --configuration Release --no-bundler
```

Chọn iPhone thực. Nếu CLI không giải quyết signing, trong Xcode chọn **Product → Scheme → Edit Scheme → Run → Build Configuration: Release**, giữ Team/device và nhấn Run. Bản này có JS bundle bên trong; mở thử khi Metro đã dừng. Vẫn cần mạng/VPN để truy cập GitLab. Local Release không thay signing/distribution requirements cho TestFlight/App Store và vẫn chịu thời hạn provisioning của team.

## Đăng nhập và thử trên sandbox

Mở app → **Kết nối** → chọn HTTPS GitLab instance. OAuth public-client cần Application ID và exact callback; PAT fallback dùng token do bạn tạo trên GitLab, nhập trực tiếp vào app. Xem [development guide](development.md#kết-nối-gitlab); không cần đưa token vào file build hay terminal.

Bắt đầu bằng đọc project/issue/pipeline trên sandbox. CI writes cần policy được chủ project kiểm chứng, xem [CI policy guide](project-ci-policy.md). Không nhập policy mẫu rồi xem nó là bằng chứng staging/production đã an toàn.

Push optional và mặc định chưa provision. Cấu hình native hiện tại bỏ APNs entitlement khi chưa có EAS project ID, phục vụ Personal Team local build. Chỉ bật push sau khi có signing/capability tương ứng theo [notification operations](notifications-operations.md). Log/artifact download cũng đang khóa đến khi native transport PoC đạt; hướng dẫn mở gate nằm trong [development](development.md#logartifact-transport-gate).

Ghi model iPhone, iOS, Xcode và GitLab version khi kiểm thử theo [device checklist](verification-results.md#checklist-cho-lần-chạy-iphone). Chưa có xác nhận native build/device pass từ môi trường phát triển Linux này.

## Khi gặp lỗi

| Triệu chứng | Kiểm tra / xử lý |
|---|---|
| CLI chỉ tới Command Line Tools hoặc thiếu iOS SDK | Mở Xcode Settings → Locations, chọn Command Line Tools thuộc Xcode đầy đủ; kiểm tra `xcode-select -p` và `xcodebuild -version` |
| Không có iPhone trong destination | Unlock/Trust, kiểm tra cáp dữ liệu, pairing trong Devices and Simulators, Developer Mode và SDK hỗ trợ iOS trên thiết bị |
| No provisioning profile / bundle ID unavailable | Chọn Team, automatic signing, dùng bundle ID riêng rồi prebuild; không thêm APNs capability khi đang dùng cấu hình local chưa push |
| Pods chưa cài / workspace chưa có | Chạy lại prebuild trên Mac với CocoaPods sẵn có; nếu `ios/` được mang từ Linux prebuild không-install, chạy `pod install` tại `apps/mobile/ios` |
| Unable to connect to development server | Metro đúng project ở 8081, cùng mạng, Local Network permission/firewall/VPN; dùng Release local khi cần thử mở app không có Metro |
| App hết thời hạn provisioning | Build/sign/install lại với Team của bạn; đây không phải GitLab token expiry |
| OAuth không quay về app | Dùng development build, exact callback/Application ID, không Expo Go; kiểm tra public/non-confidential app và HTTPS instance/VPN |
| Audit báo high dù unit pass | Giữ finding và release gate; xem [security evidence](security.md), không dùng audit suppression để chữa build |
