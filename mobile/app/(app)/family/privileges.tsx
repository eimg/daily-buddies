import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "../../../src/context/AuthContext";
import {
  fetchPrivileges,
  createPrivilege,
  deletePrivilege,
  fetchPrivilegeRequests,
  decidePrivilegeRequest,
  terminatePrivilegeRequest,
} from "../../../src/services/api";

export default function FamilyPrivilegesScreen() {
  const router = useRouter();
  const { token, profile } = useAuth();
  const isParent = profile?.role === "PARENT";
  const [form, setForm] = useState({ title: "", cost: "1", description: "" });

  const privilegesQuery = useQuery({
    queryKey: ["family-privileges", token],
    queryFn: () => fetchPrivileges(token!),
    enabled: isParent && !!token,
  });

  const requestsQuery = useQuery({
    queryKey: ["family-privilege-requests", token],
    queryFn: () => fetchPrivilegeRequests(token!),
    enabled: isParent && !!token,
  });

  useEffect(() => {
    if (!isParent && profile?.role === "CHILD") {
      router.replace("/privileges");
    }
  }, [isParent, profile?.role, router]);

  const createPrivilegeMutation = useMutation({
    mutationFn: (payload: { title: string; description?: string; cost: number }) => createPrivilege(token!, payload),
    onSuccess: async () => {
      setForm({ title: "", cost: "1", description: "" });
      await privilegesQuery.refetch();
    },
    onError: (error: Error) => Alert.alert("Unable to add privilege", error.message),
  });

  const deletePrivilegeMutation = useMutation({
    mutationFn: (privilegeId: string) => deletePrivilege(token!, privilegeId),
    onSuccess: async () => {
      await privilegesQuery.refetch();
    },
    onError: (error: Error) => Alert.alert("Unable to remove", error.message),
  });

  const decideMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "APPROVED" | "REJECTED" }) =>
      decidePrivilegeRequest(token!, requestId, { status }),
    onSuccess: async () => {
      await requestsQuery.refetch();
    },
    onError: (error: Error) => Alert.alert("Unable to update request", error.message),
  });

  const terminateMutation = useMutation({
    mutationFn: (requestId: string) => terminatePrivilegeRequest(token!, requestId),
    onSuccess: async () => {
      await requestsQuery.refetch();
      Alert.alert("Ticket ended", "Privilege ticket has been terminated.");
    },
    onError: (error: Error) => Alert.alert("Unable to terminate", error.message),
  });

  if (!token) {
    return null;
  }

  if (!isParent) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.fallback}>
          <Text style={styles.lightText}>Only parents can edit privileges.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/home")}>
            <Text style={styles.primaryText}>Return home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const requests = requestsQuery.data ?? [];
  const pendingRequests = requests.filter((request) => request.status === "PENDING");
  const activeTickets = requests.filter((request) => request.status === "APPROVED");

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Privilege Center 🌿</Text>
        </View>
        <Text style={styles.subtitle}>Design experiences, approve requests, and tidy up tickets.</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Privilege ideas</Text>
          <Text style={styles.lightText}>
            Keep options playful and growth-focused. Remove anything that no longer fits your family.
          </Text>
          <View style={styles.privilegeList}>
            {(privilegesQuery.data ?? []).length === 0 ? (
              <Text style={styles.lightText}>No privileges created yet.</Text>
            ) : (
              privilegesQuery.data!.map((privilege) => (
                <View key={privilege.id} style={styles.privilegeRow}>
                  <View style={styles.privilegeInfo}>
                    <Text style={styles.privilegeTitle}>{privilege.title}</Text>
                    {privilege.description ? <Text style={styles.lightText}>{privilege.description}</Text> : null}
                  </View>
                  <View style={styles.privilegeActions}>
                    <Text style={styles.privilegeCost}>{privilege.cost} seeds</Text>
                    <TouchableOpacity
                      onPress={() => deletePrivilegeMutation.mutate(privilege.id)}
                      style={styles.smallGhostButton}
                    >
                      <Text style={styles.smallGhostText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pending requests</Text>
          {pendingRequests.length === 0 ? (
            <Text style={styles.lightText}>No requests yet.</Text>
          ) : (
            pendingRequests.map((request) => (
              <View key={request.id} style={styles.requestRow}>
                <View style={styles.requestHeader}>
                  <View style={styles.requestInfo}>
                    <Text style={styles.privilegeTitle}>{request.privilege.title}</Text>
                    <Text style={styles.lightText}>
                      {request.childName ?? "Unknown child"} • {request.cost} seeds
                    </Text>
                  </View>
                  <View style={[styles.requestStatusPill, styles.requestStatusPending]}>
                    <Text style={styles.requestStatusText}>pending</Text>
                  </View>
                </View>
                {request.note ? <Text style={styles.lightText}>Note: {request.note}</Text> : null}
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => decideMutation.mutate({ requestId: request.id, status: "APPROVED" })}
                    disabled={decideMutation.isPending}
                  >
                    <Text style={styles.approveText}>{decideMutation.isPending ? "..." : "Approve"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallGhostButton}
                    onPress={() => decideMutation.mutate({ requestId: request.id, status: "REJECTED" })}
                    disabled={decideMutation.isPending}
                  >
                    <Text style={styles.smallGhostText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Active tickets</Text>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/privileges/history")}>
              <Text style={styles.linkText}>Ticket history</Text>
            </TouchableOpacity>
          </View>
          {activeTickets.length === 0 ? (
            <Text style={styles.lightText}>No active tickets.</Text>
          ) : (
            activeTickets.map((ticket) => (
              <View key={ticket.id} style={styles.requestRow}>
                <View style={styles.requestHeader}>
                  <View style={styles.requestInfo}>
                    <Text style={styles.privilegeTitle}>{ticket.privilege.title}</Text>
                    <Text style={styles.lightText}>
                      {ticket.childName ?? "Unknown child"} • {ticket.cost} seeds
                    </Text>
                  </View>
                  <View style={[styles.requestStatusPill, styles.requestStatusApproved]}>
                    <Text style={styles.requestStatusText}>approved</Text>
                  </View>
                </View>
                {ticket.note ? <Text style={styles.lightText}>Note: {ticket.note}</Text> : null}
                <TouchableOpacity
                  style={[styles.smallGhostButton, styles.terminateButton]}
                  onPress={() => terminateMutation.mutate(ticket.id)}
                  disabled={terminateMutation.isPending}
                >
                  <Text style={styles.terminateText}>
                    {terminateMutation.isPending ? "Terminating..." : "Terminate"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Add privilege</Text>
          <Text style={styles.lightText}>Add new ideas at the end of the day so kids have something to look forward to.</Text>
          <PrivilegeInput
            label="Title"
            value={form.title}
            onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
          />
          <PrivilegeInput
            label="Cost"
            value={form.cost}
            keyboardType="numeric"
            onChangeText={(value) => setForm((prev) => ({ ...prev, cost: value }))}
          />
          <PrivilegeInput
            label="Description"
            value={form.description}
            onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
          />
          <TouchableOpacity
            style={[styles.primaryButton, createPrivilegeMutation.isPending && styles.disabled]}
            onPress={() => {
              if (!form.title.trim()) {
                Alert.alert("Title required", "Give the privilege a short title.");
                return;
              }
              createPrivilegeMutation.mutate({
                title: form.title.trim(),
                cost: Number(form.cost) || 1,
                description: form.description || undefined,
              });
            }}
            disabled={createPrivilegeMutation.isPending}
          >
            <Text style={styles.primaryText}>
              {createPrivilegeMutation.isPending ? "Adding..." : "Add privilege"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const PrivilegeInput = ({ label, keyboardType = "default", ...props }: React.ComponentProps<typeof TextInput> & { label: string }) => (
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
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
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
  privilegeList: {
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  privilegeRow: {
    borderWidth: 1,
    borderColor: "#e0e7ff",
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  privilegeInfo: {
    gap: 4,
  },
  privilegeActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  privilegeTitle: {
    fontWeight: "600",
    color: "#1f2937",
  },
  privilegeCost: {
    color: "#4c1d95",
    fontWeight: "600",
  },
  smallGhostButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  smallGhostText: {
    color: "#475569",
    fontWeight: "600",
  },
  requestRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  requestInfo: {
    gap: 4,
    flex: 1,
  },
  requestStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  requestStatusText: {
    fontWeight: "600",
    color: "#312e81",
    textTransform: "capitalize",
  },
  requestStatusPending: {
    backgroundColor: "#eef2ff",
  },
  requestStatusApproved: {
    backgroundColor: "#dcfce7",
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  approveButton: {
    backgroundColor: "#22c55e",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  approveText: {
    color: "#fff",
    fontWeight: "600",
  },
  terminateButton: {
    borderColor: "#fecaca",
    marginTop: 6,
  },
  terminateText: {
    color: "#dc2626",
    fontWeight: "600",
    textAlign: "center",
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
