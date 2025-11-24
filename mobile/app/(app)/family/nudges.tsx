import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_NUDGES } from "../../../src/constants/nudges";
import { useAuth } from "../../../src/context/AuthContext";
import { fetchNudges, NudgeSetting, updateNudges } from "../../../src/services/api";

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
  default: "#94a3b8",
};

const getToneColor = (tone?: string | null) => TONE_COLORS[tone ?? ""] ?? TONE_COLORS.default;

const formatDisplayTime = (value?: string | null) => {
  if (!value) return "--:--";
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return value;
  const [hour, minute] = match.slice(1).map((entry) => Number(entry));
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
};

export default function NudgeSettingsScreen() {
  const router = useRouter();
  const { token, profile } = useAuth();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, NudgeSetting[]>>({});
  const [savingChildId, setSavingChildId] = useState<string | null>(null);

  const nudgesQuery = useQuery({
    queryKey: ["nudges-admin", token],
    queryFn: () => fetchNudges(token!),
    enabled: Boolean(token && profile?.role === "PARENT"),
    staleTime: 30 * 1000,
  });

  const data = (nudgesQuery.data as NudgeSetting[] | undefined) ?? [];
  const grouped = useMemo(() => {
    const next: Record<string, NudgeSetting[]> = {};
    data.forEach((entry) => {
      if (!next[entry.childId]) {
        next[entry.childId] = [];
      }
      next[entry.childId].push(entry);
    });
    return next;
  }, [data]);

  useEffect(() => {
    if (Object.keys(grouped).length > 0) {
      setDrafts(grouped);
    }
  }, [grouped]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateNudges>[1]) => updateNudges(token!, payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["nudges-admin", token] });
      if (variables.childId) {
        await queryClient.invalidateQueries({ queryKey: ["nudges", token] });
      }
      setSavingChildId(null);
    },
    onError: (error: Error) => {
      setSavingChildId(null);
      Alert.alert("Could not save nudges", error.message);
    },
  });

  const handleToggle = (childId: string, type: string, enabled: boolean) => {
    setDrafts((current) => {
      const existing = current[childId] ?? [];
      const next = existing.map((entry) =>
        entry.type === type ? { ...entry, enabled } : entry,
      );
      return { ...current, [childId]: next };
    });

    const target = drafts[childId]?.find((entry) => entry.type === type);
    if (!target) {
      return;
    }

    setSavingChildId(childId);
    mutation
      .mutateAsync({
        childId,
        nudges: [
          {
            type,
            time: target.time,
            enabled,
            message: target.message ?? null,
          },
        ],
      })
      .catch((error: Error) => {
        setDrafts((current) => {
          const existing = current[childId] ?? [];
          const next = existing.map((entry) =>
            entry.type === type ? { ...entry, enabled: !enabled } : entry,
          );
          return { ...current, [childId]: next };
        });
        Alert.alert("Could not save", error.message);
      })
      .finally(() => setSavingChildId(null));
  };

  if (!token || profile?.role !== "PARENT") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.lightText}>Only parents can manage nudges.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (nudgesQuery.isPending && data.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color="#6c63ff" />
          <Text style={styles.lightText}>Loading reminders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const entries = Object.entries(drafts);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Nudges & Reminders</Text>
        </View>
        <Text style={styles.subtitle}>
          Quick on/off here. Changes save instantly. Tap edit to change times or messages.
        </Text>

        {entries.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.lightText}>No children found yet.</Text>
          </View>
        ) : null}

        {entries.map(([childId, nudges]) => {
          const childMeta = nudges[0];
          const childName = childMeta?.childName ?? "Child";
          const avatarTone = childMeta?.childAvatarTone;
          const pending = savingChildId === childId && mutation.isPending;

          return (
            <View key={childId} style={styles.card}>
              <View style={styles.childRow}>
                <View style={[styles.avatarDot, { backgroundColor: getToneColor(avatarTone) }]} />
                <View>
                  <Text style={styles.childName}>{childName}</Text>
                  <Text style={styles.lightText}>Daily nudges</Text>
                </View>
              </View>

              {nudges.map((entry) => {
                const template = DEFAULT_NUDGES.find((item) => item.type === entry.type);
                return (
                  <View key={`${childId}-${entry.type}`} style={styles.nudgeRow}>
                    <View style={styles.nudgeInfo}>
                      <Text style={styles.nudgeLabel}>{entry.label || template?.label || entry.type}</Text>
                      <Text style={styles.nudgeHint}>Time: {formatDisplayTime(entry.time)}</Text>
                      <Text style={styles.nudgeMessage} numberOfLines={2}>
                        {entry.message || template?.message || "Local reminder"}
                      </Text>
                    </View>
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>{entry.enabled ? "On" : "Off"}</Text>
                      <Switch
                        value={entry.enabled}
                        onValueChange={(value) => handleToggle(childId, entry.type, value)}
                        thumbColor={entry.enabled ? "#6366f1" : "#e5e7eb"}
                        trackColor={{ false: "#cbd5e1", true: "#c7d2fe" }}
                        disabled={savingChildId === childId && mutation.isPending}
                      />
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.editButton}
                onPress={() => router.push(`/family/nudges/${childId}`)}
              >
                <Text style={styles.editText}>Edit times & messages</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

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
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  childName: {
    fontWeight: "700",
    color: "#111827",
  },
  nudgeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  nudgeInfo: {
    flex: 1,
    gap: 4,
  },
  nudgeLabel: {
    fontWeight: "600",
    color: "#0f172a",
  },
  nudgeHint: {
    color: "#6b7280",
  },
  nudgeMessage: {
    color: "#475569",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  switchLabel: {
    color: "#475569",
    fontWeight: "600",
  },
  editButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
  },
  editText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  avatarDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  lightText: {
    color: "#6b7280",
  },
});
