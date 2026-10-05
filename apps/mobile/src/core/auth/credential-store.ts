import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Account,
  Credential,
  accountKey,
  credentialSchema,
  SessionError,
} from "./types";

export interface CredentialStore {
  save(record: Credential): Promise<void>;
  load(account: Account): Promise<Credential | null>;
  remove(account: Account): Promise<void>;
  accounts(): Promise<Account[]>;
  active(): Promise<Account | null>;
  setActive(account: Account | null): Promise<void>;
}

const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const registryKey = "account-registry-v1";
const activeKey = "active-account-v1";
const key = async (account: Account) =>
  `credential-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, accountKey(account))}`;

export class NativeCredentialStore implements CredentialStore {
  async initialize() {
    if (!(await AsyncStorage.getItem("installation-v1"))) {
      for (const account of await this.accounts()) {
        const digest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          accountKey(account),
        );
        await SecureStore.deleteItemAsync(`service-${digest}`, options);
        await SecureStore.deleteItemAsync(`intent-${digest}`, options);
        await this.remove(account);
      }
      await SecureStore.deleteItemAsync("notification-cleanup-v1", options);
      await this.setActive(null);
      await AsyncStorage.setItem("installation-v1", "installed");
    }
  }
  async accounts(): Promise<Account[]> {
    const data = await SecureStore.getItemAsync(registryKey, options);
    if (!data) return [];
    return JSON.parse(data) as Account[];
  }
  async active(): Promise<Account | null> {
    const data = await SecureStore.getItemAsync(activeKey, options);
    return data ? (JSON.parse(data) as Account) : null;
  }
  async setActive(account: Account | null) {
    if (account)
      await SecureStore.setItemAsync(
        activeKey,
        JSON.stringify({
          instance: account.instance,
          userId: account.userId,
          username: account.username,
          kind: account.kind,
        }),
        options,
      );
    else await SecureStore.deleteItemAsync(activeKey, options);
  }
  async save(record: Credential) {
    const serialized = JSON.stringify(credentialSchema.parse(record));
    if (new TextEncoder().encode(serialized).length > 1900)
      throw new SessionError("Credential quá lớn cho secure storage.");
    await SecureStore.setItemAsync(await key(record), serialized, options);
    const accounts = (await this.accounts()).filter(
      (a) => accountKey(a) !== accountKey(record),
    );
    accounts.push({
      instance: record.instance,
      userId: record.userId,
      username: record.username,
      kind: record.kind,
    });
    await SecureStore.setItemAsync(
      registryKey,
      JSON.stringify(accounts),
      options,
    );
  }
  async load(account: Account) {
    const data = await SecureStore.getItemAsync(await key(account), options);
    return data ? credentialSchema.parse(JSON.parse(data)) : null;
  }
  async remove(account: Account) {
    await SecureStore.deleteItemAsync(await key(account), options);
    await SecureStore.setItemAsync(
      registryKey,
      JSON.stringify(
        (await this.accounts()).filter(
          (a) => accountKey(a) !== accountKey(account),
        ),
      ),
      options,
    );
  }
}
