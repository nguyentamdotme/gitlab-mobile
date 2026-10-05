import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { z } from "zod";
export const intentSchema = z.object({
  account: z.string(),
  action: z.string(),
  projectId: z.number().int().positive(),
  targetId: z.number().int().positive().optional(),
  timestamp: z.number(),
  generation: z.number(),
  ref: z.string().max(255).optional(),
  sha: z.string().max(64).optional(),
});
export type Intent = z.infer<typeof intentSchema>;
export interface Journal {
  read(account: string): Promise<Intent | null>;
  save(intent: Intent): Promise<void>;
  clear(account: string): Promise<void>;
}
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const key = async (account: string) =>
  `intent-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, account)}`;
export class NativeJournal implements Journal {
  async read(account: string) {
    const data = await SecureStore.getItemAsync(await key(account), options);
    return data ? intentSchema.parse(JSON.parse(data)) : null;
  }
  async save(intent: Intent) {
    const data = JSON.stringify(intentSchema.parse(intent));
    if (new TextEncoder().encode(data).length > 1900)
      throw new Error("Journal quota");
    await SecureStore.setItemAsync(await key(intent.account), data, options);
  }
  async clear(account: string) {
    await SecureStore.deleteItemAsync(await key(account), options);
  }
}
