import React, { useState } from "react";
import { Switch, View } from "react-native";
import { GitBranch, ArrowUpRight } from "lucide-react-native";
import { router } from "expo-router";
import {
  Body,
  Heading,
  Field,
  Button,
  Copy,
  Caption,
  ErrorNotice,
  useAction,
  useColors,
  ChoiceChips,
  IconTile,
} from "../components/ui";
import { oauth, useApp } from "../core/query/provider";
export default function Connect() {
  const app = useApp();
  const c = useColors();
  const action = useAction();
  const [instance, setInstance] = useState(
    app.account?.instance || "https://gitlab.com",
  );
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [pat, setPat] = useState(false);
  const connect = () =>
    void action.run(async () => {
      const record = pat
        ? await oauth.pat(instance, token, readOnly)
        : await oauth.connect(instance, clientId, readOnly);
      setToken("");
      await app.session.connect(record);
      router.replace("/");
    });
  return (
    <Body>
      <View style={{ marginBottom: 16 }}>
        <IconTile icon={GitBranch} />
      </View>
      <Heading>Kết nối GitLab</Heading>
      <Copy>Project, review và CI/CD trên điện thoại.</Copy>
      <ChoiceChips<"gitlab" | "self-managed">
        options={[
          { value: "gitlab", label: "GitLab.com" },
          { value: "self-managed", label: "Self-Managed" },
        ]}
        value={instance === "https://gitlab.com" ? "gitlab" : "self-managed"}
        onChange={(value) =>
          setInstance((current) =>
            value === "gitlab"
              ? "https://gitlab.com"
              : current === "https://gitlab.com"
                ? "https://"
                : current,
          )
        }
      />
      <Field label="Instance HTTPS *" value={instance} onChange={setInstance} />
      <Caption>
        Hỗ trợ Self-Managed có subpath và VPN. Mật khẩu GitLab chỉ nhập trong
        trình duyệt hệ thống.
      </Caption>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Switch
          accessibilityLabel="Chỉ đọc"
          value={readOnly}
          onValueChange={setReadOnly}
          trackColor={{ false: c.neutralSoft, true: c.accentSoft }}
          thumbColor={readOnly ? c.accent : c.card}
        />
        <Copy>Chỉ đọc</Copy>
      </View>
      <Copy>
        {readOnly
          ? "Quyền read_api + read_user."
          : "Quyền api cho phép thao tác rộng trong phạm vi quyền của bạn trên GitLab."}
      </Copy>
      <Button
        title={pat ? "Dùng OAuth PKCE" : "Dùng Personal Access Token"}
        disabled={action.busy}
        onPress={() => {
          setPat(!pat);
          setToken("");
        }}
      />
      {pat ? (
        <>
          <Field
            label="Personal Access Token"
            secure
            value={token}
            onChange={setToken}
          />
          <Caption>
            PAT không tự gia hạn. Scope chỉ đọc ở đây là hạn chế trong app; hãy
            tạo PAT với scope phù hợp trên GitLab.
          </Caption>
        </>
      ) : (
        <>
          <Field
            label="Application ID (public / non-confidential)"
            value={clientId}
            onChange={setClientId}
          />
          <Caption>
            Redirect: gitlabmobile://oauth/callback. Không nhập Client Secret.
          </Caption>
        </>
      )}
      <Button
        title={action.busy ? "Đang kết nối…" : "Kết nối GitLab"}
        variant="primary"
        icon={ArrowUpRight}
        disabled={action.busy || (pat ? !token : !clientId)}
        onPress={connect}
      />
      {!!action.error && <ErrorNotice error={action.error} />}
    </Body>
  );
}
