import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_NUDGES } from "../../../../src/constants/nudges";
import { useAuth } from "../../../../src/context/AuthContext";
import { fetchNudges, NudgeSetting, updateNudges } from "../../../../src/services/api";

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
  default: "#94a3b8",
};

const getToneColor = (tone?: string | null) => TONE_COLORS[tone ?? ""] ?? TONE_COLORS.default;

const normalizeTime = (value: string): string | null => {
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || hour > 23 || minute > 59) {
    return null;
  }
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

const formatTime = (date: Date) =>
  `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

const formatDisplayTime = (value?: string | null) => {
  const normalized = normalizeTime(value ?? "");
  if (!normalized) return "Set time";
  const [hour, minute] = normalized.split(":").map((entry) => Number(entry));
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
};

const deriveDateFromTime = (value?: string | null) => {
  const now = new Date();
  const normalized = normalizeTime(value ?? "");
  if (!normalized) {
    return now;
  }
  const [hour, minute] = normalized.split(":").map((entry) => Number(entry));
  now.setHours(hour, minute, 0, 0);
  return now;
};

export default function EditNudgesScreen() {
  const { childId } = useLocalSearchParams<{ childId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, profile } = useAuth();
  const [drafts, setDrafts] = useState<NudgeSetting[]>([]);
  const [saving, setSaving] = useState(false);
  const [timePicker, setTimePicker] = useState<{ type: string; date: Date } | null>(null);

  const nudgesQuery = useQuery({
    queryKey: ["nudges-admin-child", token, childId],
    queryFn: () => fetchNudges(token!, { childId }),
    enabled: Boolean(token && profile?.role === "PARENT" && typeof childId === "string"),
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (nudgesQuery.data && Array.isArray(nudgesQuery.data)) {
      setDrafts(nudgesQuery.data as NudgeSetting[]);
    }
  }, [nudgesQuery.data]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateNudges>[1]) => updateNudges(token!, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nudges-admin", token] });
      await queryClient.invalidateQueries({ queryKey: ["nudges-admin-child", token, childId] });
      await queryClient.invalidateQueries({ queryKey: ["nudges", token] });
      setSaving(false);
      router.back();
    },
    onError: (error: Error) => {
      setSaving(false);
      Alert.alert("Could not save nudges", error.message);
    },
  });

  const childMeta = drafts[0];
  const childName = childMeta?.childName ?? "Child";
  const avatarTone = childMeta?.childAvatarTone;

  const handleChange = (type: string, updates: Partial<NudgeSetting>) => {
    setDrafts((current) =>
      current.map((entry) => (entry.type === type ? { ...entry, ...updates } : entry)),
    );
  };

  const openTimePicker = (type: string, currentTime?: string | null) => {
    const initialDate = deriveDateFromTime(currentTime);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "time",
        is24Hour: false,
        onChange: (_event: unknown, selectedDate?: Date) => {
          if (selectedDate) {
            const formatted = formatTime(selectedDate);
            handleChange(type, { time: formatted });
          }
        },
      });
      return;
    }

    setTimePicker({ type, date: initialDate });
  };

  const handleTimeChange = (_event: unknown, selectedDate?: Date) => {
    if (!timePicker) return;
    if (selectedDate) {
      const formatted = formatTime(selectedDate);
      handleChange(timePicker.type, { time: formatted });
    }
  };

  const handleSave = () => {
    const normalized = drafts.map((entry) => ({
      type: entry.type,
      time: normalizeTime(entry.time ?? ""),
      enabled: entry.enabled,
      message: entry.message ?? null,
    }));

    if (normalized.some((entry) => !entry.time)) {
      Alert.alert("Invalid time", "Please use HH:MM (24h) format for each reminder.");
      return;
    }

    setSaving(true);
    mutation.mutate({
      childId: childId as string,
      nudges: normalized as Array<{
        type: string;
        time: string;
        enabled: boolean;
        message?: string | null;
      }>,
    });
  };

  const sortedDrafts = useMemo(
    () => drafts.slice().sort((a, b) => a.type.localeCompare(b.type)),
    [drafts],
  );

  if (!token || profile?.role !== "PARENT" || typeof childId !== "string") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.lightText}>Only parents can manage nudges.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Edit nudges</Text>
        </View>
        <View style={styles.childRow}>
          <View style={[styles.avatarDot, { backgroundColor: getToneColor(avatarTone) }]} />
          <View>
            <Text style={styles.childName}>{childName}</Text>
            <Text style={styles.lightText}>Adjust times and messages</Text>
          </View>
        </View>

        {nudgesQuery.isPending && drafts.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.lightText}>Loading nudges...</Text>
          </View>
        ) : null}

        {sortedDrafts.map((entry) => {
          const template = DEFAULT_NUDGES.find((item) => item.type === entry.type);
          return (
            <View key={entry.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.nudgeLabel}>{entry.label || template?.label || entry.type}</Text>
                  <Text style={styles.lightText}>Default: {formatDisplayTime(template?.time)}</Text>
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{entry.enabled ? "On" : "Off"}</Text>
                  <Switch
                    value={entry.enabled}
                    onValueChange={(value) => handleChange(entry.type, { enabled: value })}
                    thumbColor={entry.enabled ? "#6366f1" : "#e5e7eb"}
                    trackColor={{ false: "#cbd5e1", true: "#c7d2fe" }}
                  />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => openTimePicker(entry.type, entry.time)}
                  disabled={saving}
                >
                  <Text style={styles.timeButtonText}>
                    {formatDisplayTime(entry.time || template?.time)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Message</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={entry.message ?? ""}
                  onChangeText={(value) => handleChange(entry.type, { message: value })}
                  placeholder={template?.message ?? "Friendly reminder"}
                  multiline
                />
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save nudges"}</Text>
        </TouchableOpacity>
        {timePicker && Platform.OS === "ios" ? (
          <Modal transparent animationType="fade">
            <View style={styles.modalBackdrop}>
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={timePicker.date}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.picker}
                />
                <TouchableOpacity style={styles.pickerDone} onPress={() => setTimePicker(null)}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : null}
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
    gap: 14,
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
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  childName: {
    fontWeight: "700",
    color: "#111827",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    color: "#475569",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  nudgeLabel: {
    fontWeight: "700",
    color: "#0f172a",
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
  saveButton: {
    backgroundColor: "#6c63ff",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: "#fff",
    fontWeight: "700",
  },
  timeButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
  },
  timeButtonText: {
    color: "#111827",
    fontWeight: "600",
  },
  pickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    width: "90%",
    alignItems: "center",
  },
  pickerDone: {
    marginTop: 8,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
  },
  pickerDoneText: {
    color: "#4338ca",
    fontWeight: "700",
  },
  picker: {
    width: "100%",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  lightText: {
    color: "#6b7280",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 24,
  },
});
