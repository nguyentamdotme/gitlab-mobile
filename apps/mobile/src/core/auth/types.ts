import { z } from "zod";
export const credentialSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(["oauth", "pat"]),
  instance: z.string().url(),
  userId: z.number().int().positive(),
  username: z.string().min(1),
  clientId: z.string().optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scopes: z.array(z.string()),
  generation: z.number().int().nonnegative(),
  rotationPending: z.boolean().optional(),
});
export type Credential = z.infer<typeof credentialSchema>;
export type Account = Pick<
  Credential,
  "instance" | "userId" | "username" | "kind"
>;
export const accountKey = (account: Pick<Account, "instance" | "userId">) =>
  `${account.instance}|${account.userId}`;
export class SessionError extends Error {
  name = "SessionError";
}
