import { Fetcher, TransferError } from "./transport";
import { isTrustedApi, safeExternalUrl } from "../security/trusted-url";

export async function artifactResponse(
  fetcher: Fetcher,
  instance: string,
  startUrl: string,
  token: string,
  signal: AbortSignal,
): Promise<Response> {
  let url = startUrl;
  let credentialsAllowed = isTrustedApi(instance, startUrl);
  for (let hops = 0; hops <= 5; hops++) {
    if (signal.aborted) throw new TransferError("Tải đã hủy.");
    const response = await fetcher(url, {
      redirect: "manual",
      credentials: "omit",
      signal,
      headers: credentialsAllowed ? { Authorization: `Bearer ${token}` } : {},
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || hops === 5)
      throw new TransferError("Redirect không hợp lệ hoặc quá nhiều lần.");
    url = safeExternalUrl(new URL(location, url).toString());
    if (!isTrustedApi(instance, url)) credentialsAllowed = false;
  }
  throw new TransferError("Redirect không hợp lệ.");
}
