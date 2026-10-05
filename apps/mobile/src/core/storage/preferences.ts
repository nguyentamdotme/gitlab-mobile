import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { normalizeInstance } from "../security/trusted-url";

export const ciPolicySchema = z.object({
  instance: z.string().transform(normalizeInstance),
  projectId: z.number().int().positive(),
  refs: z.array(z.string().min(1)).min(1),
  environments: z.array(z.string().min(1)),
  risk: z.enum(["non-production", "production"]),
  variables: z.array(z.string()),
  inputsEnabled: z.boolean(),
  stopEnabled: z.boolean(),
  approvalsEnabled: z.boolean(),
  approvalReauthentication: z.boolean(),
  validated: z.boolean().refine((v) => v, "Policy chưa được kiểm thử."),
  rollback: z
    .object({ ref: z.string(), inputKey: z.string(), environment: z.string() })
    .optional(),
  redeploy: z.boolean(),
});
export type CiPolicy = z.infer<typeof ciPolicySchema>;
const preferencesSchema = z.object({
  pins: z.array(z.number().int().positive()).max(8),
  lock: z.boolean(),
  theme: z.enum(["system", "light", "dark"]),
  policies: z.array(ciPolicySchema),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences: Preferences = {
  pins: [],
  lock: false,
  theme: "system",
  policies: [],
};
export const preferenceKey = (account: string) => `preferences-v1:${account}`;
export async function loadPreferences(account: string): Promise<Preferences> {
  const value = await AsyncStorage.getItem(preferenceKey(account));
  if (!value) return { ...defaultPreferences };
  const parsed = preferencesSchema.safeParse(JSON.parse(value));
  return parsed.success ? parsed.data : { ...defaultPreferences };
}
export async function savePreferences(account: string, value: Preferences) {
  await AsyncStorage.setItem(
    preferenceKey(account),
    JSON.stringify(preferencesSchema.parse(value)),
  );
}
