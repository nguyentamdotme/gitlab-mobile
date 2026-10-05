import {
  useApp,
  mutations,
  api,
  queryClient,
  authenticateLocally,
} from "../core/query/provider";
import { useAction, confirm } from "../components/ui";
import { SessionError, accountKey } from "../core/auth/types";
import { requireCiPolicy } from "../core/security/action-policy";
import type { Intent } from "../core/storage/mutation-journal";

export function useGitLabMutation(projectId: number) {
  const app = useApp();
  const action = useAction();
  const epoch = app.session.generation;
  const assertAccount = () => {
    if (
      epoch !== app.session.generation ||
      !app.session.account ||
      accountKey(app.session.account) !== app.namespace
    )
      throw new SessionError("Tài khoản đã thay đổi. Tải lại màn hình.");
  };
  const execute = async <T>(
    name: string,
    message: string,
    intent: Omit<Intent, "account" | "timestamp" | "generation" | "projectId">,
    work: () => Promise<T>,
    options: {
      ciRef?: string;
      environment?: string;
      destructive?: boolean;
      onResult?(value: T): void;
    } = {},
  ) => {
    assertAccount();
    if (!app.online)
      throw new SessionError(
        "Đang offline. Không gửi hoặc xếp hàng lệnh GitLab.",
      );
    const policy = options.ciRef
      ? requireCiPolicy(
          app.preferences.policies,
          app.account!.instance,
          projectId,
          options.ciRef,
          options.environment,
        )
      : undefined;
    if (
      !(await confirm(
        name,
        `${app.account?.instance}\nProject #${projectId}\n${message}`,
        options.destructive,
      ))
    )
      return;
    assertAccount();
    if (policy?.risk === "production") {
      await authenticateLocally();
      assertAccount();
    }
    const result = await mutations.run({ ...intent, projectId }, async () => {
      assertAccount();
      return work();
    });
    assertAccount();
    await queryClient.invalidateQueries({ queryKey: [app.namespace] });
    options.onResult?.(result);
  };
  return { ...action, execute, assertAccount, api };
}
