import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { z } from "zod";
import { UserRound, Plus, Bell, LogOut } from "lucide-react-native";
import { store, useApp } from "../../core/query/provider";
import { Account } from "../../core/auth/types";
import { ciPolicySchema } from "../../core/storage/preferences";
import {
  Body,
  Heading,
  Card,
  Copy,
  Caption,
  Button,
  Field,
  ErrorNotice,
  useAction,
  confirm,
  SectionHeading,
  ListRow,
  IconTile,
} from "../../components/ui";
export default function Settings() {
  const app = useApp();
  const action = useAction();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [policies, setPolicies] = useState("");
  useEffect(() => {
    void store.accounts().then(setAccounts);
  }, [app.namespace]);
  const loadPolicy = () =>
    setPolicies(JSON.stringify(app.preferences.policies, null, 2));
  return (
    <Body>
      <Heading>Cài đặt</Heading>
      <Card>
        <IconTile icon={UserRound} />
        <Copy>
          {app.account?.username} · {app.account?.instance}
        </Copy>
        <Caption>
          GitLab {app.version || "chưa xác định phiên bản"} · {app.state}
        </Caption>
      </Card>
      <SectionHeading title="Tài khoản" />
      <Button
        title="Kết nối thêm tài khoản"
        icon={Plus}
        onPress={() => router.push("/connect")}
      />
      {accounts.map((account) => (
        <ListRow
          key={`${account.instance}|${account.userId}`}
          title={account.username}
          subtitle={account.instance}
          icon={UserRound}
          onPress={() =>
            void action.run(async () => {
              if (action.busy) return;
              await app.session.restore(account);
              router.replace("/");
            })
          }
        />
      ))}
      <SectionHeading title="Bảo mật và giao diện" />
      <Card>
        <Button
          title={
            app.preferences.lock ? "Tắt khóa app" : "Bật khóa app (5 phút)"
          }
          onPress={() =>
            void action.run(async () => {
              if (
                await confirm(
                  "Khóa app",
                  "Dùng xác thực thiết bị khi mở lại sau 5 phút.",
                )
              )
                await app.updatePreferences({
                  ...app.preferences,
                  lock: !app.preferences.lock,
                });
            })
          }
        />
        <Button
          title={`Theme: ${app.preferences.theme}`}
          onPress={() =>
            void action.run(() =>
              app.updatePreferences({
                ...app.preferences,
                theme:
                  app.preferences.theme === "system"
                    ? "light"
                    : app.preferences.theme === "light"
                      ? "dark"
                      : "system",
              }),
            )
          }
        />
        <Button
          title="Thông báo và dữ liệu service"
          icon={Bell}
          onPress={() => router.push("/settings/notifications")}
        />
      </Card>
      <SectionHeading title="Policy CI" />
      <Card>
        <Copy>Policy CI theo project</Copy>
        <Caption>
          Chỉ import policy mà chủ project đã kiểm thử. Không có policy thì CI
          chỉ đọc. Giá trị variables không được lưu ở đây.
        </Caption>
        <Button title="Xem/sửa policies" onPress={loadPolicy} />
        {policies !== "" && (
          <>
            <Field
              label="Policy JSON array"
              value={policies}
              onChange={setPolicies}
              multiline
            />
            <Button
              title="Lưu policy đã kiểm thử"
              disabled={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const parsed = z
                    .array(ciPolicySchema)
                    .parse(JSON.parse(policies));
                  if (parsed.some((p) => p.instance !== app.account?.instance))
                    throw new Error("Wrong instance");
                  if (
                    await confirm(
                      "Lưu policy",
                      "Tôi xác nhận mapping project/ref/environment này đã được chủ project kiểm thử.",
                    )
                  ) {
                    await app.updatePreferences({
                      ...app.preferences,
                      policies: parsed,
                    });
                    setPolicies("");
                  }
                })
              }
            />
          </>
        )}
      </Card>
      {app.pendingIntent && (
        <Card>
          <Copy>
            Kết quả chưa rõ: {app.pendingIntent.action}. Lúc{" "}
            {new Date(app.pendingIntent.timestamp).toLocaleString()}.
          </Copy>
          <Button
            title="Đã kiểm tra kết quả trên GitLab"
            danger
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                if (
                  await confirm(
                    "Bỏ chặn thao tác",
                    "Chỉ xác nhận sau khi đã tải lại resource và kiểm tra trên GitLab. App sẽ không replay lệnh cũ.",
                    true,
                  )
                )
                  await app.acknowledgeIntent();
              })
            }
          />
        </Card>
      )}
      <Caption>
        Credentials nằm trong OS secure storage. Private content chỉ giữ trong
        RAM; draft mất khi app đóng. Không có telemetry mặc định.
      </Caption>
      <Button
        title="Đăng xuất tài khoản hiện tại"
        danger
        icon={LogOut}
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            if (
              await confirm(
                "Đăng xuất",
                "Xóa phiên, cache và file tạm trên thiết bị. PAT sẽ không bị thu hồi trên GitLab.",
                true,
              )
            ) {
              const revoked = await app.logout();
              router.replace("/connect");
              if (!revoked)
                await confirm(
                  "Đã xóa phiên trên thiết bị",
                  "Chưa xác nhận revoke tại GitLab. Bạn có thể revoke grant/token trong GitLab Settings.",
                );
            }
          })
        }
      />
      {!!action.error && <ErrorNotice error={action.error} />}
    </Body>
  );
}
