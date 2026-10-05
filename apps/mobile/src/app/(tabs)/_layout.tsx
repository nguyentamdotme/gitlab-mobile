import React from "react";
import { Tabs, router } from "expo-router";
import { Pressable, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  House,
  FolderGit2,
  Workflow,
  Bell,
  Settings2,
  GitBranch,
  UserRound,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useColors } from "../../components/ui";

const tabIcon = (Icon: LucideIcon) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon color={color as string} size={21} strokeWidth={1.8} />;
  };

export default function TabLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 4 },
        tabBarItemStyle: { paddingTop: 5 },
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: c.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GitBranch size={17} color={c.accent} />
            </View>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>
              GitLab Mobile
            </Text>
          </View>
        ),
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở cài đặt tài khoản"
            onPress={() => router.push("/settings")}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.accentSoft,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <UserRound size={18} color={c.accent} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen
        name="projects"
        options={{ title: "Projects", tabBarIcon: tabIcon(FolderGit2) }}
      />
      <Tabs.Screen
        name="ci"
        options={{ title: "CI/CD", tabBarIcon: tabIcon(Workflow) }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: "Inbox", tabBarIcon: tabIcon(Bell) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: tabIcon(Settings2) }}
      />
    </Tabs>
  );
}
