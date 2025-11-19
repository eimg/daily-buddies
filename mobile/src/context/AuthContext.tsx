import { createContext, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { AUTH_STORAGE_KEY } from "../config/env";
import {
  login as loginRequest,
  registerParent,
  fetchProfile,
  RegisterParentPayload,
  UserSummary,
} from "../services/api";

type AuthStatus = "loading" | "ready";

type AuthContextShape = {
  status: AuthStatus;
  token: string | null;
  profile: UserSummary | null;
  login: (identifier: string, password: string) => Promise<void>;
  registerParent: (payload: RegisterParentPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const queryClient = useQueryClient();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (storedToken) {
          setToken(storedToken);
        }
      } catch (error) {
        console.warn("Auth bootstrap error", error);
        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
        setToken(null);
      } finally {
        setStatus("ready");
      }
    };

    void bootstrap();
  }, []);

  const persistToken = async (newToken: string) => {
    setToken(newToken);
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, newToken);
  };

  const clearToken = async () => {
    setToken(null);
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
  };

  const profileQuery = useQuery({
    queryKey: ["profile", token],
    queryFn: () => fetchProfile(token!),
    enabled: !!token,
  });

  const login = async (identifier: string, password: string) => {
    const response = await loginRequest(identifier, password);
    await persistToken(response.token);
    queryClient.setQueryData(["profile", response.token], response.user);
  };

  const parentRegister = async (payload: RegisterParentPayload) => {
    const response = await registerParent(payload);
    await persistToken(response.token);
    queryClient.setQueryData(["profile", response.token], response.parent);
  };

  const logout = async () => {
    await clearToken();
    queryClient.removeQueries({ queryKey: ["profile"] });
  };

  const refreshProfile = async () => {
    if (!token) return;
    await queryClient.invalidateQueries({ queryKey: ["profile", token] });
  };

  const value: AuthContextShape = {
    status,
    token,
    profile: (profileQuery.data as UserSummary | null) ?? null,
    login,
    registerParent: parentRegister,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
