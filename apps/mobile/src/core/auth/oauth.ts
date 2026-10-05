import * as AuthSession from "expo-auth-session";
import { normalizeInstance } from "../security/trusted-url";
import { Fetcher, readBounded } from "../gitlab/transport";
import { Credential, SessionError } from "./types";
import { RefreshFailure } from "./session-manager";
import { z } from "zod";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  created_at: z.number().positive(),
  expires_in: z.number().positive(),
  scope: z.string().min(1),
  token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
});
const userSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
});
export const redirectUri = "gitlabmobile://oauth/callback";
export function validateCallback(
  url: string,
  state: string,
  startedAt: number,
  now = Date.now(),
) {
  const callback = new URL(url);
  const expected = new URL(redirectUri);
  if (
    callback.protocol !== expected.protocol ||
    callback.host !== expected.host ||
    callback.pathname !== expected.pathname ||
    callback.username ||
    callback.password ||
    callback.hash ||
    callback.searchParams.getAll("state").length !== 1 ||
    callback.searchParams.get("state") !== state ||
    now - startedAt > 600_000 ||
    now < startedAt ||
    callback.searchParams.get("error") ||
    callback.searchParams.getAll("code").length !== 1 ||
    !callback.searchParams.get("code")
  ) {
    throw new SessionError(
      "Callback không hợp lệ hoặc đã hết hạn. Hãy bắt đầu kết nối lại.",
    );
  }
  return callback.searchParams.get("code")!;
}

export class OAuthClient {
  constructor(private fetcher: Fetcher) {}
  private async token(
    instance: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ) {
    let response: Response;
    try {
      response = await this.fetcher(
        `${normalizeInstance(instance)}/oauth/token`,
        {
          method: "POST",
          redirect: "manual",
          credentials: "omit",
          signal: AbortSignal.any([
            AbortSignal.timeout(20_000),
            ...(signal ? [signal] : []),
          ]),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams(params).toString(),
        },
      );
    } catch {
      throw new RefreshFailure(
        "refresh-outcome-unknown",
        "Mất kết quả đổi token. Kết nối lại để tránh dùng refresh token đã xoay.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([400, 401].includes(response.status))
        throw new RefreshFailure(
          "reconnect-required",
          "Grant không còn hợp lệ. Hãy kết nối lại GitLab.",
        );
      if (response.status === 429)
        throw new RefreshFailure(
          "temporarily-offline",
          "GitLab đang giới hạn request. Hãy thử lại sau.",
        );
      throw new RefreshFailure(
        "refresh-outcome-unknown",
        "GitLab chưa xác nhận kết quả đổi token. Hãy kết nối lại.",
      );
    }
    try {
      return tokenSchema.parse(
        JSON.parse(
          new TextDecoder().decode(await readBounded(response, 16_384)),
        ),
      );
    } catch {
      throw new RefreshFailure(
        "reconnect-required",
        "Không thể khôi phục cặp token hợp lệ. Hãy kết nối lại.",
      );
    }
  }
  async connect(
    input: string,
    clientId: string,
    readOnly: boolean,
  ): Promise<Credential> {
    const instance = normalizeInstance(input);
    if (!clientId.trim())
      throw new SessionError("Nhập Application ID public của instance này.");
    const request = new AuthSession.AuthRequest({
      clientId: clientId.trim(),
      redirectUri,
      scopes: readOnly ? ["read_api", "read_user"] : ["api"],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    });
    const discovery = { authorizationEndpoint: `${instance}/oauth/authorize` };
    await request.makeAuthUrlAsync(discovery);
    const startedAt = Date.now();
    const response = await request.promptAsync(discovery);
    if (response.type !== "success")
      throw new SessionError("Đã hủy hoặc GitLab từ chối kết nối.");
    const code = validateCallback(response.url, request.state, startedAt);
    if (!request.codeVerifier)
      throw new SessionError("Không còn PKCE verifier; hãy bắt đầu lại.");
    const result = await this.token(instance, {
      grant_type: "authorization_code",
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      code,
      code_verifier: request.codeVerifier,
    });
    const user = await this.user(instance, result.access_token);
    return {
      schemaVersion: 1,
      kind: "oauth",
      instance,
      userId: user.id,
      username: user.username,
      clientId: clientId.trim(),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: (result.created_at + result.expires_in) * 1000,
      scopes: result.scope.split(" "),
      generation: 0,
    };
  }
  async user(instance: string, token: string) {
    const response = await this.fetcher(
      `${normalizeInstance(instance)}/api/v4/user`,
      {
        redirect: "manual",
        credentials: "omit",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new SessionError("Không xác minh được tài khoản GitLab.");
    }
    return userSchema.parse(
      JSON.parse(new TextDecoder().decode(await readBounded(response, 65_536))),
    );
  }
  async pat(
    instanceInput: string,
    accessToken: string,
    readOnly: boolean,
  ): Promise<Credential> {
    const instance = normalizeInstance(instanceInput);
    const user = await this.user(instance, accessToken.trim());
    return {
      schemaVersion: 1,
      kind: "pat",
      instance,
      userId: user.id,
      username: user.username,
      accessToken: accessToken.trim(),
      scopes: readOnly ? ["read_api", "read_user"] : ["api"],
      generation: 0,
    };
  }
  refresh = async (
    record: Credential,
    signal: AbortSignal,
  ): Promise<Credential> => {
    if (!record.refreshToken || !record.clientId)
      throw new RefreshFailure(
        "reconnect-required",
        "Không còn refresh token.",
      );
    const result = await this.token(
      record.instance,
      {
        grant_type: "refresh_token",
        client_id: record.clientId,
        refresh_token: record.refreshToken,
      },
      signal,
    );
    return {
      ...record,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: (result.created_at + result.expires_in) * 1000,
      scopes: result.scope.split(" "),
      generation: record.generation + 1,
    };
  };
  async revoke(record: Credential): Promise<boolean> {
    if (record.kind !== "oauth" || !record.clientId) return false;
    try {
      const response = await this.fetcher(`${record.instance}/oauth/revoke`, {
        method: "POST",
        credentials: "omit",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: record.clientId,
          token: record.accessToken,
        }).toString(),
      });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }
}
