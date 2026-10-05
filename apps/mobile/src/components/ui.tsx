import React, { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight, RefreshCw } from "lucide-react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../core/query/provider";
import { safeError } from "../core/security/redaction";
import { safeExternalUrl } from "../core/security/trusted-url";
import type { Page } from "../core/gitlab/client";

export const light = {
  bg: "#F6F3FC",
  card: "#FFFFFF",
  text: "#292338",
  muted: "#696174",
  border: "#EEE8F5",
  borderStrong: "#DED6E9",
  accent: "#7052B3",
  accentSoft: "#EEE7FA",
  onAccent: "#FFFFFF",
  danger: "#B42345",
  dangerSoft: "#FCECF1",
  success: "#18734B",
  successSoft: "#E7F6EE",
  warning: "#8A5B0B",
  warningSoft: "#FFF5DC",
  neutralSoft: "#ECE8F2",
  codeBg: "#272235",
  codeText: "#F2EDF9",
};
export const dark: typeof light = {
  bg: "#171321",
  card: "#211A2E",
  text: "#F7F3FB",
  muted: "#B9AFC9",
  border: "#342B42",
  borderStrong: "#483A5A",
  accent: "#C4A8FF",
  accentSoft: "#382850",
  onAccent: "#211A2E",
  danger: "#FF91A7",
  dangerSoft: "#442733",
  success: "#8BDEB1",
  successSoft: "#203C31",
  warning: "#FFD486",
  warningSoft: "#47371F",
  neutralSoft: "#30283C",
  codeBg: "#110E18",
  codeText: "#F2EDF9",
};
export const useColors = () => (useApp().dark ? dark : light);

export function Body({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: c.text,
        fontSize: 22,
        lineHeight: 30,
        fontWeight: "700",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}
export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.sectionHeading}>
      <Text
        accessibilityRole="header"
        style={{
          color: c.text,
          fontSize: 18,
          lineHeight: 25,
          fontWeight: "600",
          flexShrink: 1,
        }}
      >
        {title}
      </Text>
      {action}
    </View>
  );
}
export function Copy({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  const c = useColors();
  return (
    <Text
      selectable
      style={{
        color: c.text,
        fontSize: mono ? 13 : 14,
        lineHeight: mono ? 20 : 21,
        fontFamily: mono
          ? Platform.select({ ios: "Menlo", android: "monospace" })
          : undefined,
        marginVertical: 4,
      }}
    >
      {children}
    </Text>
  );
}
export function Caption({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      style={{
        color: c.muted,
        fontSize: 12,
        lineHeight: 18,
        marginVertical: 4,
      }}
    >
      {children}
    </Text>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderColor: c.border,
        borderWidth: 1,
        padding: 16,
        borderRadius: 16,
        marginVertical: 6,
      }}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  danger = false,
  variant = "outline",
  icon: Icon,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  danger?: boolean;
  variant?: "outline" | "primary" | "ghost";
  icon?: LucideIcon;
}) {
  const c = useColors();
  const backgroundColor = danger
    ? c.dangerSoft
    : variant === "primary"
      ? c.accent
      : variant === "ghost"
        ? "transparent"
        : c.card;
  const color = danger
    ? c.danger
    : variant === "primary"
      ? c.onAccent
      : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 10,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
        borderRadius: 12,
        backgroundColor,
        borderColor:
          danger || variant !== "outline" ? "transparent" : c.borderStrong,
        borderWidth: 1,
        marginVertical: 5,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      {Icon && <Icon size={17} color={color} strokeWidth={1.9} />}
      <Text
        style={{
          color,
          fontWeight: "600",
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  secure = false,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  secure?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const c = useColors();
  const required = label.includes("*");
  return (
    <View style={{ marginVertical: 7 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: 12,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        {label.replace("*", "")}
        {required && <Text style={{ color: c.danger }}>*</Text>}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        selectionColor={c.accent}
        style={{
          color: c.text,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.borderStrong,
          borderRadius: 12,
          minHeight: multiline ? 104 : 46,
          padding: 12,
          fontSize: 16,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
export function Status({ value }: { value: string }) {
  const c = useColors();
  const key = value.toLowerCase();
  const failed = [
    "failed",
    "failure",
    "canceled",
    "canceling",
    "error",
  ].includes(key);
  const good = [
    "success",
    "passed",
    "available",
    "merged",
    "resolved",
  ].includes(key);
  const waiting = [
    "manual",
    "pending",
    "blocked",
    "delayed",
    "waiting_for_resource",
  ].includes(key);
  const active = ["running", "created", "preparing"].includes(key);
  const color = failed
    ? c.danger
    : good
      ? c.success
      : waiting
        ? c.warning
        : active
          ? c.accent
          : c.muted;
  const backgroundColor = failed
    ? c.dangerSoft
    : good
      ? c.successSoft
      : waiting
        ? c.warningSoft
        : active
          ? c.accentSoft
          : c.neutralSoft;
  const labels: Record<string, string> = {
    failed: "Thất bại",
    success: "Thành công",
    running: "Đang chạy",
    pending: "Đang chờ",
    manual: "Thủ công",
    canceled: "Đã hủy",
    canceling: "Đang hủy",
    skipped: "Đã bỏ qua",
    blocked: "Bị chặn",
    created: "Đã tạo",
    available: "Khả dụng",
    stopped: "Đã dừng",
    opened: "Đang mở",
    closed: "Đã đóng",
    merged: "Đã merge",
  };
  return (
    <View
      accessibilityLabel={`Trạng thái: ${labels[key] || value || "Chưa xác định"}`}
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        backgroundColor,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color, fontWeight: "600", fontSize: 12 }}>
        {labels[key] || value || "Chưa xác định"}
      </Text>
    </View>
  );
}
export function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  const c = useColors();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: c.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={20} color={c.accent} strokeWidth={1.8} />
    </View>
  );
}
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
}) {
  const c = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          style={{
            minHeight: 40,
            borderRadius: 999,
            paddingHorizontal: 14,
            justifyContent: "center",
            backgroundColor: option.value === value ? c.accent : c.neutralSoft,
          }}
        >
          <Text
            style={{
              color: option.value === value ? c.onAccent : c.text,
              fontSize: 14,
              fontWeight: option.value === value ? "600" : "400",
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function ListRow({
  title,
  subtitle,
  onPress,
  icon,
  status,
}: {
  title: string;
  subtitle?: string;
  onPress(): void;
  icon: LucideIcon;
  status?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, status].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? c.accentSoft : c.card,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        minHeight: 72,
        marginVertical: 5,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <IconTile icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            color: c.text,
            fontSize: 14,
            lineHeight: 20,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            style={{
              color: c.muted,
              fontSize: 12,
              lineHeight: 18,
              marginTop: 4,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        {status ? (
          <View style={{ marginTop: 8 }}>
            <Status value={status} />
          </View>
        ) : null}
      </View>
      <ChevronRight size={17} color={c.muted} strokeWidth={1.8} />
    </Pressable>
  );
}
export function MetricTile({
  value,
  label,
  icon: Icon,
  onPress,
}: {
  value: string | number;
  label: string;
  icon: LucideIcon;
  onPress(): void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 94,
        padding: 14,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 16,
        backgroundColor: pressed ? c.accentSoft : c.card,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: c.accentSoft,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Icon size={16} color={c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: c.text,
            fontSize: 23,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: c.muted, fontSize: 12, lineHeight: 16 }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?(): void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: c.dangerSoft,
        padding: 16,
        marginVertical: 8,
      }}
    >
      <Text style={{ color: c.danger, fontSize: 14, lineHeight: 21 }}>
        {safeError(error)}
      </Text>
      {retry && <Button title="Thử lại" icon={RefreshCw} onPress={retry} />}
    </View>
  );
}
export const confirm = (
  title: string,
  message: string,
  destructive = false,
): Promise<boolean> =>
  new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Hủy", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Xác nhận",
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false },
    ),
  );
export async function openExternal(input: string) {
  const url = safeExternalUrl(input);
  if (await confirm("Mở GitLab", new URL(url).hostname))
    await Linking.openURL(url);
}
export function useResource<T>(
  key: unknown[],
  fetcher: (signal: AbortSignal) => Promise<T>,
  poll?: (data?: T) => number | false,
) {
  const app = useApp();
  const focused = useIsFocused();
  const enabled = !!app.account && !app.obscured && app.online && focused;
  const shouldPoll = app.foreground && app.online && focused && poll;
  return useQuery({
    queryKey: [app.namespace, ...key],
    queryFn: ({ signal }) => fetcher(signal),
    enabled,
    refetchInterval: shouldPoll ? (query) => poll(query.state.data) : false,
  });
}
export function PagedList<T>({
  title,
  queryKey,
  load,
  renderItem,
  header,
}: {
  title: string;
  queryKey: unknown[];
  load(page: number, signal: AbortSignal): Promise<Page<T>>;
  renderItem(item: T): React.ReactElement;
  header?: React.ReactNode;
}) {
  const app = useApp();
  const c = useColors();
  const focused = useIsFocused();
  const query = useInfiniteQuery({
    queryKey: [app.namespace, ...queryKey],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => load(pageParam, signal),
    getNextPageParam: (page) => page.next,
    enabled: !!app.account && app.online && !app.obscured && focused,
  });
  const unique = new Map<string, T>();
  const pages = query.data?.pages.flatMap((page) => page.items) || [];
  for (const [index, item] of pages.entries()) {
    const identity =
      item && typeof item === "object" && "id" in item
        ? String(item.id)
        : String(index);
    unique.set(identity, item);
  }
  const items = [...unique.entries()];
  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.body}
      data={items}
      keyExtractor={(item) => item[0]}
      renderItem={({ item }) => renderItem(item[1])}
      ListHeaderComponent={
        <>
          <Heading>{title}</Heading>
          {header}
          <Caption>
            {app.account?.username} · {app.account?.instance}
          </Caption>
          {!app.online && (
            <Caption>Offline · dữ liệu chỉ giữ trong phiên này</Caption>
          )}
          {query.dataUpdatedAt > 0 && (
            <Caption>
              Cập nhật {new Date(query.dataUpdatedAt).toLocaleTimeString()}
            </Caption>
          )}
          {query.isError && (
            <ErrorNotice
              error={query.error}
              retry={() => void query.refetch()}
            />
          )}
        </>
      }
      ListEmptyComponent={
        query.isLoading ? (
          <View accessibilityLabel="Đang tải dữ liệu" style={{ marginTop: 16 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  height: 72,
                  marginVertical: 5,
                  borderRadius: 16,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 16,
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    height: 12,
                    width: "60%",
                    borderRadius: 8,
                    backgroundColor: c.neutralSoft,
                  }}
                />
                <View
                  style={{
                    height: 10,
                    width: "38%",
                    borderRadius: 8,
                    backgroundColor: c.neutralSoft,
                    marginTop: 10,
                  }}
                />
              </View>
            ))}
          </View>
        ) : query.isError ? null : (
          <Text
            style={{
              color: c.muted,
              fontSize: 14,
              textAlign: "center",
              paddingVertical: 24,
            }}
          >
            {app.online
              ? "Chưa có nội dung trong mục này."
              : "Kết nối mạng để tải nội dung."}
          </Text>
        )
      }
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      ListFooterComponent={
        query.hasNextPage ? (
          <Button
            title={query.isFetchingNextPage ? "Đang tải…" : "Tải trang tiếp"}
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        ) : null
      }
    />
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const app = useApp();
  const inFlight = React.useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (err) {
      setError(err);
    } finally {
      inFlight.current = false;
      setBusy(false);
      await app.refreshIntent().catch(() => undefined);
    }
  };
  return { busy, error, run };
}
const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 24, paddingBottom: 48, flexGrow: 1 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 24,
    marginBottom: 12,
  },
});
