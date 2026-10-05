import { useEffect } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { pushDataSchema } from "@gitlab-mobile/contracts";
import { useApp } from "../../core/query/provider";
import { safeError } from "../../core/security/redaction";
import {
  serviceUrl,
  flushCleanup,
  resolveEvent,
  loadServiceRecord,
  renewSubscriptions,
  ensureServiceSession,
  serviceRequest,
} from "./api";

export function NotificationListener() {
  const app = useApp();
  useEffect(() => {
    if (!serviceUrl() || !app.namespace || app.obscured || !app.online) return;
    let active = true;
    let remove: (() => void) | undefined;
    let removeToken: (() => void) | undefined;
    void (async () => {
      const Notifications = await import("expo-notifications");
      if (!active) return;
      const seen = new Set<string>();
      const handle = async (
        response: Awaited<
          ReturnType<typeof Notifications.getLastNotificationResponseAsync>
        >,
      ) => {
        if (!active || !response) return;
        const key = response.notification.request.identifier;
        if (seen.has(key)) return;
        seen.add(key);
        const data = pushDataSchema.safeParse(
          response.notification.request.content.data,
        );
        if (!data.success) return;
        try {
          const route = await resolveEvent(
            data.data.eventId,
            data.data.accountRef,
          );
          if (active)
            router.push(
              `/projects/${route.projectId}/${route.resource}/${route.id}`,
            );
        } catch (error) {
          if (active) Alert.alert("Không mở được thông báo", safeError(error));
        } finally {
          await Notifications.clearLastNotificationResponseAsync();
        }
      };
      const subscription =
        Notifications.addNotificationResponseReceivedListener(
          (response) => void handle(response),
        );
      remove = () => subscription.remove();
      const tokenSubscription = Notifications.addPushTokenListener(
        () =>
          void (async () => {
            const projectId = (await import("expo-constants")).default
              .expoConfig?.extra?.eas?.projectId;
            if (!projectId || !active) return;
            const auth = await ensureServiceSession();
            const token = await Notifications.getExpoPushTokenAsync({
              projectId,
            });
            if (active)
              await serviceRequest(
                `/v1/devices/${auth.deviceId}`,
                "PUT",
                { pushToken: token.data },
                auth,
              );
          })().catch(() => undefined),
      );
      removeToken = () => tokenSubscription.remove();
      await handle(await Notifications.getLastNotificationResponseAsync());
      await flushCleanup();
      if (active && (await loadServiceRecord(app.namespace)))
        await renewSubscriptions();
    })().catch(() => undefined);
    return () => {
      active = false;
      remove?.();
      removeToken?.();
    };
  }, [app.namespace, app.obscured, app.online]);
  return null;
}
