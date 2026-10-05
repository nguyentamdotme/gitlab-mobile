import React from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import {
  AppProvider,
  useApp,
  authenticateLocally,
} from "../core/query/provider";
import {
  Body,
  Button,
  Copy,
  Heading,
  useColors,
  useAction,
  ErrorNotice,
} from "../components/ui";
import { NotificationListener } from "../features/notifications/listener";

function Navigation() {
  const app = useApp();
  const c = useColors();
  const action = useAction();
  if (app.state === "restoring")
    return (
      <View
        style={{ flex: 1, justifyContent: "center", backgroundColor: c.bg }}
      >
        <ActivityIndicator />
      </View>
    );
  if (app.obscured)
    return (
      <Body>
        <Heading>GitLab Mobile</Heading>
        <Copy>Phiên riêng tư</Copy>
        {app.state === "locked" && (
          <Button
            title="Mở khóa"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                await authenticateLocally();
                app.session.unlock();
              })
            }
          />
        )}
        {!!action.error && <ErrorNotice error={action.error} />}
      </Body>
    );
  return (
    <>
      <NotificationListener />
      <Stack
        key={`${app.namespace}:${app.session.generation}`}
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          contentStyle: { backgroundColor: c.bg },
          title: "GitLab Mobile",
        }}
      >
        <Stack.Protected guard={!!app.account}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="projects/[projectId]/index"
            options={{ title: "Project" }}
          />
          <Stack.Screen
            name="projects/[projectId]/[resource]/index"
            options={{ title: "GitLab" }}
          />
          <Stack.Screen
            name="projects/[projectId]/[resource]/[id]"
            options={{ title: "Chi tiết" }}
          />
          <Stack.Screen
            name="projects/[projectId]/[resource]/new"
            options={{ title: "Tạo mới" }}
          />
          <Stack.Screen
            name="projects/[projectId]/repository"
            options={{ title: "Repository" }}
          />
          <Stack.Screen
            name="projects/[projectId]/ci-lint"
            options={{ title: "CI lint" }}
          />
          <Stack.Screen
            name="settings/notifications"
            options={{ title: "Thông báo" }}
          />
        </Stack.Protected>
        <Stack.Screen name="connect" options={{ title: "Kết nối GitLab" }} />
        <Stack.Screen
          name="oauth/callback"
          options={{ title: "OAuth callback" }}
        />
      </Stack>
    </>
  );
}
export default function RootLayout() {
  return (
    <AppProvider>
      <Navigation />
    </AppProvider>
  );
}
