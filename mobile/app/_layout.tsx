import { Stack } from "expo-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/context/AuthContext";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
