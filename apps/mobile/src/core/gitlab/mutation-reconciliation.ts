import type { SessionManager } from "../auth/session-manager";
import { accountKey, SessionError } from "../auth/types";
import type { Intent, Journal } from "../storage/mutation-journal";
import { GitLabError, UnknownMutation } from "./errors";
import { PolicyError } from "../security/action-policy";
export class MutationRunner {
  private pending = false;
  constructor(
    private session: SessionManager,
    public journal: Journal,
  ) {}
  async run<T>(
    intent: Omit<Intent, "account" | "timestamp" | "generation">,
    dispatch: () => Promise<T>,
  ): Promise<T> {
    if (this.pending)
      throw new SessionError("Đang gửi một thao tác; hãy chờ kết quả.");
    const account = this.session.account;
    if (!account) throw new SessionError("Kết nối GitLab trước.");
    const namespace = accountKey(account);
    const generation = this.session.generation;
    this.pending = true;
    let dispatched = false;
    try {
      if (await this.journal.read(namespace)) throw new UnknownMutation();
      const token = await this.session.ensureToken();
      if (!token.scopes.includes("api"))
        throw new SessionError(
          "Chế độ chỉ đọc. Kết nối lại với scope api để ghi.",
        );
      await this.journal.save({
        ...intent,
        account: namespace,
        timestamp: Date.now(),
        generation,
      });
      if (
        generation !== this.session.generation ||
        this.session.signal.aborted
      ) {
        await this.journal.clear(namespace);
        throw new SessionError("Tài khoản đã thay đổi.");
      }
      dispatched = true;
      const result = await dispatch();
      if (generation !== this.session.generation) throw new UnknownMutation();
      await this.journal.clear(namespace);
      return result;
    } catch (error) {
      if (dispatched && error instanceof PolicyError) {
        await this.journal.clear(namespace);
        throw error;
      }
      if (
        dispatched &&
        error instanceof GitLabError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        await this.journal.clear(namespace);
        throw error;
      }
      if (dispatched) throw new UnknownMutation();
      throw error;
    } finally {
      this.pending = false;
    }
  }
}
