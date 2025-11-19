import Constants from "expo-constants";
import { Platform, NativeModules } from "react-native";

type Extra = {
  apiBaseUrl?: string;
  hostUri?: string;
  expoClient?: {
    hostUri?: string;
  };
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const resolveDevHost = (): string | undefined => {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoConfig?.extra?.expoGo?.hostUri ??
    extra.hostUri ??
    extra.expoClient?.hostUri;

  if (hostUri) {
    return hostUri.split(":")[0];
  }

  const scriptUrl = NativeModules.SourceCode?.scriptURL;
  if (scriptUrl) {
    try {
      const url = new URL(scriptUrl);
      return url.hostname;
    } catch {
      const parts = scriptUrl.split("://");
      if (parts[1]) {
        return parts[1].split(":")[0];
      }
    }
  }

  return undefined;
};

const fallbackHost = resolveDevHost() ?? (Platform.OS === "android" ? "10.0.2.2" : "localhost");
const fallbackBaseUrl = `http://${fallbackHost}:4000/api`;

const normalizeBaseUrl = (value?: string) => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (Platform.OS === "android" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
      parsed.hostname = "10.0.2.2";
      return parsed.toString();
    }
    return value;
  } catch {
    if (Platform.OS === "android" && value.includes("localhost")) {
      return value.replace("localhost", "10.0.2.2");
    }
    if (Platform.OS === "android" && value.includes("127.0.0.1")) {
      return value.replace("127.0.0.1", "10.0.2.2");
    }
    return value;
  }
};

const normalizedExtraBaseUrl = normalizeBaseUrl(extra.apiBaseUrl);

export const API_BASE_URL = normalizedExtraBaseUrl ?? fallbackBaseUrl;

export const AUTH_STORAGE_KEY = "daily-buddies-auth-token";
