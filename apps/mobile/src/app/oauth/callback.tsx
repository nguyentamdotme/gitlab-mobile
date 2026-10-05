import React from "react";
import { router } from "expo-router";
import { Body, Button, Copy } from "../../components/ui";
export default function Callback() {
  return (
    <Body>
      <Copy>
        Trở về cửa sổ kết nối. Nếu app đã bị đóng và không còn PKCE verifier,
        hãy bắt đầu kết nối lại.
      </Copy>
      <Button title="Kết nối lại" onPress={() => router.replace("/connect")} />
    </Body>
  );
}
