import { Stack } from "expo-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/context/AuthContext";
import { NudgeSyncProvider } from "../src/context/NudgeSync";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <NudgeSyncProvider>
            <Stack
              screenOptions={{
                headerShown: false,
              }}
            />
          </NudgeSyncProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
