import { useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../../src/context/AuthContext";
import { updateProfile } from "../../src/services/api";

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
};

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, token, refreshProfile, logout } = useAuth();

  const [name, setName] = useState(profile?.name ?? "");
  const [avatarTone, setAvatarTone] = useState(profile?.avatarTone ?? "sunrise");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    setName(profile?.name ?? "");
    setAvatarTone(profile?.avatarTone ?? "");
  }, [profile?.name, profile?.avatarTone]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateProfile>[1]) =>
      updateProfile(token!, payload),
    onSuccess: async () => {
      await refreshProfile();
      Alert.alert("Updated", "Profile saved.");
    },
    onError: (error: Error) => {
      Alert.alert("Could not save profile", error.message);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please add a display name.");
      return;
    }

    mutation.mutate({
      name: name.trim(),
      avatarTone: avatarTone || null,
      currentPassword: currentPassword || undefined,
      newPassword: newPassword || undefined,
    });

    setCurrentPassword("");
    setNewPassword("");
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backLabel}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.header}>Profile</Text>
          </View>

          <Text style={styles.subtitle}>Update your display name and password.</Text>

          <View style={styles.card}>
            {profile?.username ? (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Username</Text>
                <Text style={styles.infoValue}>@{profile.username}</Text>
              </View>
            ) : null}
            <Input label="Display Name" value={name} onChangeText={setName} />
            <TonePicker value={avatarTone} onChange={setAvatarTone} />
            <Input
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="Required to change password"
            />
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.primaryButton, mutation.isPending && styles.disabled]}
              onPress={handleSave}
              disabled={mutation.isPending}
            >
              <Text style={styles.primaryText}>{mutation.isPending ? "Saving..." : "Save"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Input = ({
  label,
  secureTextEntry,
  ...rest
}: {
  label: string;
  secureTextEntry?: boolean;
  [key: string]: unknown;
}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      placeholderTextColor="#94a3b8"
      autoCapitalize="none"
      secureTextEntry={secureTextEntry}
      {...rest}
    />
  </View>
);

const TonePicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (tone: string) => void;
}) => (
  <View style={styles.toneRow}>
    {Object.keys(TONE_COLORS).map((tone) => (
      <TouchableOpacity
        key={tone}
        style={[styles.toneChip, value === tone && styles.toneChipActive]}
        onPress={() => onChange(tone)}
      >
        <View style={[styles.toneDot, { backgroundColor: TONE_COLORS[tone] }]} />
        <Text style={value === tone ? styles.toneTextActive : styles.toneText}>{tone}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f3ff",
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  header: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2933",
  },
  subtitle: {
    color: "#6b7280",
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d4d4d8",
  },
  backLabel: {
    color: "#4b5563",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  field: {
    gap: 6,
  },
  infoRow: {
    gap: 4,
  },
  infoValue: {
    fontWeight: "600",
    color: "#1f2933",
  },
  label: {
    color: "#475569",
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  primaryButton: {
    backgroundColor: "#6c63ff",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.6,
  },
  toneRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toneChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toneChipActive: {
    backgroundColor: "#ede9fe",
    borderColor: "#c4b5fd",
  },
  toneText: {
    color: "#475569",
  },
  toneTextActive: {
    color: "#4c1d95",
    fontWeight: "600",
  },
  toneDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  logoutButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#dc2626",
    fontWeight: "700",
  },
});
