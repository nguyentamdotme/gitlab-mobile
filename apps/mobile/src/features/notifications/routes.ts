import { eventRouteSchema } from "@gitlab-mobile/contracts";
import { type Account, SessionError } from "../../core/auth/types";

export function notificationRoute(
  value: unknown,
  account: Pick<Account, "instance" | "userId">,
) {
  const route = eventRouteSchema.parse(value);
  if (route.instance !== account.instance || route.userId !== account.userId) {
    throw new SessionError("Thông báo không thuộc tài khoản hiện tại.");
  }
  return route;
}
