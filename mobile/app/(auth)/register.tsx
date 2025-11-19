import { Link, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
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

export default function RegisterScreen() {
  const router = useRouter();
  const { registerParent } = useAuth();
  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!familyName || !name || !email || !username || !password) {
      Alert.alert("Missing info", "Please fill every field to get started.");
      return;
    }

    try {
      setSubmitting(true);
      await registerParent({
        familyName: familyName.trim(),
        parent: {
          name: name.trim(),
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          password,
        },
      });
      router.replace("/home");
    } catch (error) {
      Alert.alert("Could not sign up", (error as Error).message);
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
            <Text style={styles.title}>Create Your Daily Buddies Space ✨</Text>
            <Text style={styles.subtitle}>
              A calm home base for routines, rewards, and kind notes.
            </Text>

            <Field label="Family Name">
              <TextInput
                style={styles.input}
                value={familyName}
                onChangeText={setFamilyName}
                placeholder="Fern Family"
              />
            </Field>

            <Field label="Your Name">
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Maya Fern"
              />
            </Field>

            <Field label="Email">
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="maya@example.com"
              />
            </Field>

            <Field label="Username">
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
                placeholder="maya"
              />
            </Field>

            <Field label="Password">
              <TextInput
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
              />
            </Field>

            <TouchableOpacity
              onPress={handleRegister}
              disabled={submitting}
              style={[styles.button, submitting && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{submitting ? "Creating..." : "Create Family"}</Text>
            </TouchableOpacity>

            <View style={styles.linkRow}>
              <Text style={styles.lightText}>Already part of Daily Buddies?</Text>
              <Link href="/login" style={styles.link}>
                Sign in
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#f0f4ff",
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
    shadowColor: "#1f2933",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: "600",
    color: "#1f2933",
  },
  subtitle: {
    color: "#6b7280",
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
    backgroundColor: "#2ec4b6",
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
    color: "#2ec4b6",
    fontWeight: "600",
  },
});
