import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../src/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignTask,
  completeTask,
  deleteTask,
  fetchFamilyMembers,
  fetchTaskDetail,
  unassignTask,
} from "../../../src/services/api";

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
  default: "#94a3b8",
};

export default function TaskDetailScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["task-detail", taskId, token],
    queryFn: () => fetchTaskDetail(token!, taskId as string),
    enabled: !!token && typeof taskId === "string",
  });

  const familyQuery = useQuery({
    queryKey: ["family-members", token],
    queryFn: () => fetchFamilyMembers(token!),
    enabled: !!token,
  });

  const invalidateDetail = async () => {
    if (!token || !taskId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task-detail", taskId, token] }),
      queryClient.invalidateQueries({ queryKey: ["tasks", token] }),
    ]);
  };

  const assignMutation = useMutation({
    mutationFn: (childId: string) => assignTask(token!, taskId as string, childId),
    onSuccess: invalidateDetail,
  });

  const unassignMutation = useMutation({
    mutationFn: (childId: string) => unassignTask(token!, taskId as string, childId),
    onSuccess: invalidateDetail,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ childId, status }: { childId: string; status: "COMPLETED" | "PENDING" }) =>
      completeTask(token!, taskId as string, { childId, status }),
    onSuccess: invalidateDetail,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(token!, taskId as string),
    onSuccess: async () => {
      await invalidateDetail();
      router.replace("/tasks");
    },
  });

  const detail = detailQuery.data;
  const children =
    familyQuery.data?.filter((member) => member.role === "CHILD").map((child) => ({
      id: child.id,
      name: child.name,
      avatarTone: child.avatarTone ?? "default",
    })) ?? [];

  const assignedIds = useMemo(() => new Set(detail?.assignments.map((assignment) => assignment.childId)), [detail]);

  const handleDelete = () => {
    Alert.alert("Delete task?", "This will remove the task and its history for assigned children.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  if (!taskId || !token) {
    return null;
  }

  if (detailQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      </SafeAreaView>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Unable to load task details.</Text>
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
          <Text style={styles.header}>{detail.title}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardLabel}>Reward</Text>
          <Text style={styles.cardValue}>{detail.points} seeds</Text>
          <Text style={styles.cardLabel}>Frequency</Text>
          <Text style={styles.cardValue}>{detail.frequency}</Text>
          <Text style={styles.cardLabel}>Days</Text>
          <Text style={styles.cardValue}>
            {detail.daysOfWeek && detail.daysOfWeek.length > 0 ? detail.daysOfWeek.join(", ") : "Any day"}
          </Text>
          {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}
          {detail.routineName ? <Text style={styles.description}>Part of {detail.routineName}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assigned Children</Text>
          {detail.assignments.length === 0 ? (
            <Text style={styles.lightText}>No children assigned yet.</Text>
          ) : (
            detail.assignments.map((assignment) => (
              <View key={assignment.childId} style={styles.assignmentRow}>
                <View style={styles.assignmentInfo}>
                  <View
                    style={[
                      styles.avatarDot,
                      { backgroundColor: TONE_COLORS[assignment.childAvatarTone ?? "default"] ?? TONE_COLORS.default },
                    ]}
                  />
                  <Text style={styles.assignmentName}>{assignment.childName}</Text>
                </View>
                <View style={styles.assignmentActions}>
                  <TouchableOpacity
                    style={[
                      styles.smallActionButton,
                      assignment.status === "COMPLETED" && styles.smallActionButtonCompleted,
                    ]}
                    onPress={() =>
                      toggleStatusMutation.mutate({
                        childId: assignment.childId,
                        status: assignment.status === "COMPLETED" ? "PENDING" : "COMPLETED",
                      })
                    }
                    disabled={toggleStatusMutation.isPending}
                  >
                    <Text style={styles.smallActionText}>
                      {assignment.status === "COMPLETED" ? "Undo" : "Complete"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => unassignMutation.mutate(assignment.childId)}
                    disabled={unassignMutation.isPending}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assign to child</Text>
          {children.length === 0 ? (
            <Text style={styles.lightText}>Add children from the family screen first.</Text>
          ) : (
            <View style={styles.chipRow}>
              {children.map((child) => {
                const assigned = assignedIds.has(child.id);
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[styles.toneChip, assigned && styles.toneChipActive]}
                    onPress={() => (assigned ? unassignMutation.mutate(child.id) : assignMutation.mutate(child.id))}
                  >
                    <View
                      style={[
                        styles.toneDot,
                        { backgroundColor: TONE_COLORS[child.avatarTone ?? "default"] ?? TONE_COLORS.default },
                      ]}
                    />
                    <Text style={assigned ? styles.toneChipTextActive : styles.toneChipText}>{child.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {detail.completions.length === 0 ? (
            <Text style={styles.lightText}>No history yet.</Text>
          ) : (
            detail.completions.map((completion) => (
              <View key={completion.id} style={styles.historyRow}>
                <View>
                  <Text style={styles.historyName}>{completion.childName}</Text>
                  <Text style={styles.lightText}>{new Date(completion.date).toLocaleString()}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    completion.status === "COMPLETED" ? styles.statusPillCompleted : styles.statusPillPending,
                  ]}
                >
                  <Text style={styles.statusText}>{completion.status.toLowerCase()}</Text>
                </View>
              </View>
            ))
          )}
        </View>
        <TouchableOpacity
          style={[styles.deleteButton, deleteMutation.isPending && styles.disabledButton]}
          onPress={handleDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={styles.deleteButtonText}>{deleteMutation.isPending ? "Deleting…" : "Delete Task"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8f5ff",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  header: {
    fontSize: 22,
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
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  cardLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#9ca3af",
    letterSpacing: 1,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  description: {
    color: "#475569",
    marginTop: 6,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  lightText: {
    color: "#94a3b8",
  },
  assignmentRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 12,
    marginBottom: 12,
  },
  assignmentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  assignmentName: {
    fontWeight: "600",
    color: "#111827",
  },
  assignmentActions: {
    flexDirection: "row",
    gap: 8,
  },
  smallActionButton: {
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#eef2ff",
  },
  smallActionButtonCompleted: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  smallActionText: {
    color: "#4338ca",
    fontWeight: "600",
  },
  removeButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: "#dc2626",
    fontWeight: "600",
  },
  chipRow: {
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
  toneChipText: {
    color: "#475569",
  },
  toneChipTextActive: {
    color: "#4c1d95",
    fontWeight: "600",
  },
  toneDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  avatarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
    marginBottom: 10,
  },
  historyName: {
    fontWeight: "600",
    color: "#111827",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillCompleted: {
    backgroundColor: "#dcfce7",
  },
  statusPillPending: {
    backgroundColor: "#eef2ff",
  },
  statusText: {
    fontWeight: "600",
    color: "#312e81",
    textTransform: "capitalize",
  },
  errorText: {
    color: "#dc2626",
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  deleteButtonText: {
    color: "#dc2626",
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
