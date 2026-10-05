import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { AppState, Platform, useColorScheme } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { NativeCredentialStore } from "../auth/credential-store";
import { SessionManager } from "../auth/session-manager";
import { OAuthClient } from "../auth/oauth";
import { GitLabClient } from "../gitlab/client";
import { Fetcher } from "../gitlab/transport";
import { MutationRunner } from "../gitlab/mutation-reconciliation";
import { NativeJournal, Intent } from "../storage/mutation-journal";
import { GitLabApi } from "../../features/gitlab-api";
import { accountKey, type Account } from "../auth/types";
import {
  Preferences,
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from "../storage/preferences";
import { cleanArtifacts } from "../../features/jobs/transfers";

export const fetcher: Fetcher = expoFetch as unknown as Fetcher;
export const store = new NativeCredentialStore();
export const oauth = new OAuthClient(fetcher);
export const session = new SessionManager(store, oauth.refresh);
export const api = new GitLabApi(new GitLabClient(session, fetcher));
export const journal = new NativeJournal();
export const mutations = new MutationRunner(session, journal);
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000, gcTime: 5 * 60_000 },
    mutations: { retry: false },
  },
});

type ContextValue = {
  session: SessionManager;
  account: Account | null;
  namespace: string;
  state: SessionManager["state"];
  preferences: Preferences;
  updatePreferences(value: Preferences): Promise<void>;
  pendingIntent: Intent | null;
  refreshIntent(): Promise<void>;
  acknowledgeIntent(): Promise<void>;
  version?: string;
  dark: boolean;
  online: boolean;
  foreground: boolean;
  obscured: boolean;
  logout(): Promise<boolean>;
};
const Context = createContext<ContextValue | null>(null);
export const useApp = () => {
  const value = useContext(Context);
  if (!value) throw new Error("Missing app provider");
  return value;
};
export async function authenticateLocally() {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Xác nhận bằng thiết bị",
    cancelLabel: "Hủy",
    disableDeviceFallback: false,
  });
  if (!result.success) throw new Error("Authentication canceled");
}
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [, render] = useState(0);
  const [preferencesState, setPreferences] = useState<{
    namespace: string;
    value: Preferences;
  }>({ namespace: "", value: defaultPreferences });
  const [intentState, setIntent] = useState<{
    namespace: string;
    value: Intent | null;
  }>({ namespace: "", value: null });
  const [versionState, setVersion] = useState<{
    namespace: string;
    value?: string;
  }>({ namespace: "" });
  const [online, setOnline] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const scheme = useColorScheme();
  const account = session.account;
  const namespace = account ? accountKey(account) : "";
  const preferences =
    preferencesState.namespace === namespace
      ? preferencesState.value
      : defaultPreferences;
  const pendingIntent =
    intentState.namespace === namespace ? intentState.value : null;
  const version =
    versionState.namespace === namespace ? versionState.value : undefined;
  const state = session.state;
  const epoch = session.generation;
  const refreshIntent = useCallback(async () => {
    const current = session.account;
    const generation = session.generation;
    const value = current ? await journal.read(accountKey(current)) : null;
    if (generation === session.generation)
      setIntent({ namespace: current ? accountKey(current) : "", value });
  }, []);
  useEffect(() => {
    const unsubscribe = session.subscribe(() => render((v) => v + 1));
    let canceled = false;
    void (async () => {
      try {
        cleanArtifacts();
        await store.initialize();
        if (!canceled) await session.restore();
      } catch {
        session.markUnauthorized();
      }
    })();
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    void queryClient.cancelQueries();
    queryClient.clear();
    cleanArtifacts();
    let active = true;
    if (namespace) {
      void loadPreferences(namespace)
        .then((value) => {
          if (active) setPreferences({ namespace, value });
        })
        .catch(() => undefined);
      void journal
        .read(namespace)
        .then((value) => {
          if (active) setIntent({ namespace, value });
        })
        .catch(() => undefined);
      void api.version().then((value) => {
        if (active) setVersion({ namespace, value });
      });
    }
    return () => {
      active = false;
    };
  }, [namespace, epoch]);
  useEffect(() => {
    let backgroundAt = 0;
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      focusManager.setFocused(state === "active");
      if (state !== "active") {
        if (!backgroundAt) backgroundAt = Date.now();
        void queryClient.cancelQueries();
        if (preferences.lock) {
          queryClient.clear();
          cleanArtifacts();
        }
      } else {
        if (
          preferences.lock &&
          backgroundAt &&
          Date.now() - backgroundAt >= 5 * 60_000
        )
          session.lock();
        backgroundAt = 0;
        void refreshIntent().catch(() => undefined);
      }
    });
    void Network.getNetworkStateAsync().then((value) => {
      setOnline(value.isInternetReachable !== false);
      onlineManager.setOnline(value.isInternetReachable !== false);
    });
    const network = Network.addNetworkStateListener((value) => {
      setOnline(value.isInternetReachable !== false);
      onlineManager.setOnline(value.isInternetReachable !== false);
    });
    if (Platform.OS === "ios")
      void ScreenCapture.enableAppSwitcherProtectionAsync().catch(
        () => undefined,
      );
    return () => {
      subscription.remove();
      network.remove();
    };
  }, [preferences.lock, refreshIntent]);
  useEffect(() => {
    if (state === "locked") {
      void queryClient.cancelQueries();
      queryClient.clear();
      cleanArtifacts();
    }
  }, [state]);
  const updatePreferences = async (value: Preferences) => {
    const currentEpoch = session.generation;
    await savePreferences(namespace, value);
    if (currentEpoch === session.generation)
      setPreferences({ namespace, value });
  };
  const logout = async () => {
    const record = session.record;
    const oldNamespace = namespace;
    await queryClient.cancelQueries();
    queryClient.clear();
    cleanArtifacts();
    await session.logout();
    if (oldNamespace) await journal.clear(oldNamespace);
    if (oldNamespace)
      await import("../../features/notifications/api")
        .then((module) => module.cleanupService(oldNamespace))
        .catch(() => undefined);
    return record ? oauth.revoke(record) : false;
  };
  return (
    <Context.Provider
      value={{
        session,
        account,
        namespace,
        state: session.state,
        preferences,
        updatePreferences,
        pendingIntent,
        refreshIntent,
        acknowledgeIntent: async () => {
          await journal.clear(namespace);
          setIntent({ namespace, value: null });
        },
        version,
        dark:
          preferences.theme === "dark" ||
          (preferences.theme === "system" && scheme === "dark"),
        online,
        foreground,
        obscured: !foreground || session.state === "locked",
        logout,
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Context.Provider>
  );
}
