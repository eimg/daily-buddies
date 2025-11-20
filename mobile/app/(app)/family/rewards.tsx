import { useEffect, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../src/context/AuthContext";
import { fetchFamilyStreakSettings, updateFamilyStreakSettings } from "../../../src/services/api";

export default function RewardsScreen() {
  const router = useRouter();
  const { token, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ daily: "0", weekly: "0", monthly: "0", yearly: "0" });

  const streakQuery = useQuery({
    queryKey: ["family-streaks", token],
    queryFn: () => fetchFamilyStreakSettings(token!),
    enabled: !!token,
  });

  useEffect(() => {
    if (streakQuery.data) {
      setForm({
        daily: String(streakQuery.data.dailyStreakReward ?? 0),
        weekly: String(streakQuery.data.weeklyStreakReward ?? 0),
        monthly: String(streakQuery.data.monthlyStreakReward ?? 0),
        yearly: String(streakQuery.data.yearlyStreakReward ?? 0),
      });
    }
  }, [
    streakQuery.data?.dailyStreakReward,
    streakQuery.data?.weeklyStreakReward,
    streakQuery.data?.monthlyStreakReward,
    streakQuery.data?.yearlyStreakReward,
  ]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateFamilyStreakSettings>[1]) => updateFamilyStreakSettings(token!, payload),
    onSuccess: async () => {
      await streakQuery.refetch();
      Alert.alert("Saved", "Rewards updated.");
    },
    onError: (error: Error) => Alert.alert("Unable to save", error.message),
  });

  if (!token) {
    return null;
  }

  const isParent = profile?.role === "PARENT";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: 32 + insets.bottom }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backLabel}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.header}>Streak Rewards ✨</Text>
          </View>

          {!isParent ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Rewards overview</Text>
              <Text style={styles.lightText}>
                Only parents can configure streak rewards. Ask your parent if you’d like to see new privilege ideas in your
                Privilege Center screen.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Streak rewards</Text>
                <Text style={styles.lightText}>
                  Daily rewards trigger when all assigned tasks finish. Weekly (day 7), monthly (day 31), and yearly (day 365)
                  bonuses land when the streak stays intact.
                </Text>
              <RewardInput
                label="Daily reward"
                value={form.daily}
                keyboardType="numeric"
                onChangeText={(value) => setForm((prev) => ({ ...prev, daily: value }))}
              />
              <RewardInput
                label="Weekly reward"
                value={form.weekly}
                keyboardType="numeric"
                onChangeText={(value) => setForm((prev) => ({ ...prev, weekly: value }))}
              />
              <RewardInput
                label="Monthly reward"
                value={form.monthly}
                keyboardType="numeric"
                onChangeText={(value) => setForm((prev) => ({ ...prev, monthly: value }))}
              />
              <RewardInput
                label="Yearly reward"
                value={form.yearly}
                keyboardType="numeric"
                onChangeText={(value) => setForm((prev) => ({ ...prev, yearly: value }))}
              />
                <TouchableOpacity
                  style={[styles.primaryButton, mutation.isPending && styles.disabled]}
                  onPress={() =>
                    mutation.mutate({
                      dailyStreakReward: Number(form.daily) || 0,
                      weeklyStreakReward: Number(form.weekly) || 0,
                      monthlyStreakReward: Number(form.monthly) || 0,
                      yearlyStreakReward: Number(form.yearly) || 0,
                    })
                  }
                  disabled={mutation.isPending}
                >
                  <Text style={styles.primaryText}>{mutation.isPending ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
              </View>

            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const RewardInput = ({ label, keyboardType = "default", ...props }: React.ComponentProps<typeof TextInput> & { label: string }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput style={styles.input} keyboardType={keyboardType} placeholderTextColor="#94a3b8" {...props} />
  </View>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f3ff",
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
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#111827",
  },
  lightText: {
    color: "#94a3b8",
  },
  field: {
    gap: 6,
  },
  divider: {
    height: 1,
    backgroundColor: "#e4e4f7",
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
  linkButton: {
    paddingVertical: 4,
  },
  linkText: {
    color: "#6c63ff",
    fontWeight: "600",
  },
});
