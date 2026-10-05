import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "GitLab Mobile",
  slug: "gitlab-mobile",
  version: "0.1.0",
  scheme: "gitlabmobile",
  orientation: "default",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier:
      process.env.EXPO_PUBLIC_IOS_BUNDLE_ID || "org.tani.gitlabmobile",
    supportsTablet: true,
    infoPlist: {
      NSFaceIDUsageDescription:
        "Mở khóa GitLab Mobile và xác nhận thao tác nhạy cảm.",
    },
  },
  android: { package: "org.tani.gitlabmobile", allowBackup: false },
  plugins: [
    "expo-router",
    "expo-web-browser",
    ["expo-secure-store", { configureAndroidBackup: true }],
    [
      "expo-local-authentication",
      { faceIDPermission: "Mở khóa GitLab Mobile." },
    ],
    "expo-sharing",
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? ["expo-notifications"] : []),
    [
      "./plugins/with-local-signing",
      { pushEnabled: !!process.env.EXPO_PUBLIC_EAS_PROJECT_ID },
    ],
  ],
  extra: {
    notificationService: process.env.EXPO_PUBLIC_NOTIFICATION_SERVICE || "",
    boundedTransfersVerified:
      process.env.EXPO_PUBLIC_BOUNDED_TRANSFERS_VERIFIED === "true",
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
      : {}),
  },
};
export default config;
