export function normalizeInstance(input: string): string {
  if (/%2e|%2f|%5c/i.test(input))
    throw new Error("Đường dẫn instance không hợp lệ.");
  const url = new URL(input.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Instance phải là HTTPS, không chứa credentials, query hoặc fragment.",
    );
  }
  if (/%2f|%5c|%2e/i.test(url.pathname) || url.pathname.includes("//")) {
    throw new Error("Đường dẫn instance không hợp lệ.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function isTrustedApi(base: string, input: string): boolean {
  const target = new URL(input);
  const instance = new URL(normalizeInstance(base));
  const prefix = `${instance.pathname.replace(/\/$/, "")}/api/v4/`;
  return (
    target.origin === instance.origin &&
    !target.username &&
    !target.password &&
    target.pathname.startsWith(prefix) &&
    !target.hash &&
    !/%2e|%5c/i.test(target.pathname)
  );
}

export function safeExternalUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Chỉ mở liên kết HTTPS.");
  return url.toString();
}

export const segment = (value: string | number): string =>
  encodeURIComponent(String(value));
