import React, { useState } from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useApp } from "../../core/query/provider";
import {
  Body,
  Heading,
  Copy,
  Caption,
  Card,
  Button,
  Field,
  ErrorNotice,
  useAction,
  confirm,
} from "../../components/ui";
import { z } from "zod";
import { subscriptionPreferencesSchema } from "@gitlab-mobile/contracts";
import {
  serviceUrl,
  createServiceSession,
  serviceRequest,
  subscriptions,
  subscriptionSchema,
  watch,
  ensureServiceSession,
  cleanupService,
} from "../../features/notifications/api";
import { SessionError } from "../../core/auth/types";
export default function NotificationSettings() {
  const app = useApp();
  const action = useAction();
  const [rows, setRows] = useState<z.infer<typeof subscriptionSchema>[]>([]);
  const [projectId, setProjectId] = useState("");
  const [eventTypes, setEventTypes] = useState("pipelines,merge-requests");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const setup = () =>
    void action.run(async () => {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId)
        throw new SessionError(
          "Push cần EAS project ID và APNs/FCM provisioning. Bản iPhone qua cáp có thể dùng app khi push chưa cấu hình.",
        );
      if (
        !(await confirm(
          "Bật push",
          "Receiver tin cậy sẽ tạm dùng access token để xác minh quyền, không giữ GitLab token. Lease project 24h; mở app để gia hạn. Payload push chỉ có ID opaque.",
        ))
      )
        return;
      const Notifications = await import("expo-notifications");
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
          name: "GitLab",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted")
        permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted")
        throw new SessionError("Thiết bị chưa cho phép thông báo.");
      const auth = await createServiceSession();
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      await serviceRequest(
        `/v1/devices/${auth.deviceId}`,
        "PUT",
        { pushToken: token.data },
        auth,
      );
      setRows(await subscriptions());
    });
  if (!serviceUrl())
    return (
      <Body>
        <Heading>Thông báo</Heading>
        <Copy>
          Notification service chưa cấu hình. App vẫn gọi trực tiếp GitLab và
          refresh khi đang mở.
        </Copy>
        <Caption>
          Push trên iPhone cần APNs provisioning; không bắt buộc để build app
          qua cáp. Xem docs/notifications-operations.md.
        </Caption>
      </Body>
    );
  return (
    <Body>
      <Heading>Thông báo</Heading>
      <Caption>Receiver: {serviceUrl()}</Caption>
      <Button
        title="Kết nối / đăng ký lại push"
        variant="primary"
        disabled={action.busy}
        onPress={setup}
      />
      <Button
        title="Tải subscriptions"
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            setRows(await subscriptions());
          })
        }
      />
      <Field
        label="Numeric project ID cần watch"
        value={projectId}
        onChange={setProjectId}
      />
      <Field
        label="Event types (dấu phẩy)"
        value={eventTypes}
        onChange={setEventTypes}
      />
      <Field
        label="Quiet hours bắt đầu UTC (phút từ 00:00, optional)"
        value={quietStart}
        onChange={setQuietStart}
      />
      <Field
        label="Quiet hours kết thúc UTC (phút từ 00:00)"
        value={quietEnd}
        onChange={setQuietEnd}
      />
      <Button
        title="Watch / sửa preferences"
        variant="primary"
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            const id = z.number().int().positive().parse(Number(projectId));
            const preferences = subscriptionPreferencesSchema.parse({
              events: eventTypes.split(",").map((v) => v.trim()),
              quietHours: quietStart
                ? { start: Number(quietStart), end: Number(quietEnd) }
                : null,
            });
            if (
              !(await confirm(
                "Watch project",
                `Project #${id}. Maintainer cần cấu hình project webhook tại receiver trước.`,
              ))
            )
              return;
            await watch(id, preferences);
            setRows(await subscriptions());
          })
        }
      />
      {rows.map((row) => (
        <Card key={row.id}>
          <Copy>Project #{row.project_id}</Copy>
          <Caption>
            Lease: {row.lease_until} · {row.preferences.events.join(", ")}
          </Caption>
          <Button
            title="Unwatch"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                await serviceRequest(
                  `/v1/subscriptions/${row.id}`,
                  "DELETE",
                  undefined,
                  await ensureServiceSession(),
                );
                setRows(await subscriptions());
              })
            }
          />
        </Card>
      ))}
      <Button
        title="Tắt push và xóa dữ liệu service của phiên này"
        danger
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            if (
              await confirm(
                "Xóa service data",
                "Generic push đã ở hàng đợi OS có thể đến trễ. Lệnh này không xóa dữ liệu GitLab.",
                true,
              )
            ) {
              await serviceRequest(
                "/v1/data",
                "DELETE",
                undefined,
                await ensureServiceSession(),
              );
              await cleanupService(app.namespace);
              setRows([]);
            }
          })
        }
      />
      <Caption>
        Offline logout giữ cleanup handle trong secure queue. Lease 24h giới hạn
        thông báo dư; push đã gửi cho OS có thể đến trễ và không mở được private
        data sau khi phiên/quyền mất.
      </Caption>
      {!!action.error && <ErrorNotice error={action.error} />}
    </Body>
  );
}
