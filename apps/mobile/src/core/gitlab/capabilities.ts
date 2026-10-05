export function atLeast(
  version: string | undefined,
  major: number,
  minor: number,
): boolean {
  const parts = version?.match(/^(\d+)\.(\d+)/);
  if (!parts) return false;
  return (
    Number(parts[1]) > major ||
    (Number(parts[1]) === major && Number(parts[2]) >= minor)
  );
}
export const supportsInputs = (version?: string) => atLeast(version, 18, 1);
export const terminal = (status: string) =>
  ["success", "failed", "canceled", "skipped"].includes(status);
