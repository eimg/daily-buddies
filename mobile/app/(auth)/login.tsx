import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/context/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert("Missing info", "Please enter your username or email and password.");
      return;
    }

    try {
      setSubmitting(true);
      await login(identifier.trim(), password);
      router.replace("/home");
    } catch (error) {
      Alert.alert("Could not sign in", (error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back 🌱</Text>
            <Text style={styles.subtitle}>
              Gentle routines await. Sign in to sync with your Daily Buddy.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Username or Email</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="maya or mom@example.com"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
              />
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={submitting}
              style={[styles.button, submitting && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{submitting ? "Signing in..." : "Sign In"}</Text>
            </TouchableOpacity>

            <View style={styles.linkRow}>
              <Text style={styles.lightText}>Need an account?</Text>
              <Link href="/register" style={styles.link}>
                Create one
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#f7f5ff",
  },
  container: {
    padding: 24,
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#1f2933",
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: 6,
  },
  label: {
    color: "#374151",
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  button: {
    backgroundColor: "#6c63ff",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  lightText: {
    color: "#6b7280",
  },
  link: {
    color: "#6c63ff",
    fontWeight: "600",
  },
});
