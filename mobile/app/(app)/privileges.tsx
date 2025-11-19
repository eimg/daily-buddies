import { useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../src/context/AuthContext";
import {
  fetchPrivileges,
  fetchMyPrivilegeRequests,
  requestPrivilege,
  PrivilegeRequestEntry,
} from "../../src/services/api";

const statusCopy: Record<string, string> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Try again soon",
};

export default function PrivilegesScreen() {
  const router = useRouter();
  const { token, profile } = useAuth();
  const isChild = profile?.role === "CHILD";
  const availableSeeds = profile?.progress?.seedBalance ?? 0;

  const privilegesQuery = useQuery({
    queryKey: ["privileges", token],
    queryFn: () => fetchPrivileges(token!),
    enabled: !!token,
  });

  const requestsQuery = useQuery({
    queryKey: ["my-privilege-requests", token],
    queryFn: () => fetchMyPrivilegeRequests(token!),
    enabled: !!token && isChild,
  });

  const requestMutation = useMutation({
    mutationFn: (privilegeId: string) => requestPrivilege(token!, privilegeId),
    onSuccess: async () => {
      await requestsQuery.refetch();
      Alert.alert("Requested", "Hang tight—your parent will take a look.");
    },
    onError: (error: Error) => Alert.alert("Unable to request", error.message),
  });

  const requests = requestsQuery.data ?? [];
  const latestByPrivilege = useMemo(() => {
    const map = new Map<string, PrivilegeRequestEntry>();
    requests.forEach((request) => {
      if (request.status === "TERMINATED") {
        return;
      }
      const existing = map.get(request.privilegeId);
      if (!existing || new Date(request.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map.set(request.privilegeId, request);
      }
    });
    return map;
  }, [requests]);

  const approvedTickets = requests.filter((entry) => entry.status === "APPROVED");
  const pendingRequests = requests.filter((entry) => entry.status === "PENDING");
  const rejectedRequests = requests.filter((entry) => entry.status === "REJECTED");

  if (!token) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Privileges 🌟</Text>
        </View>
        <Text style={styles.subtitle}>Trade your seeds for shared experiences.</Text>

        {!isChild ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Heads up</Text>
            <Text style={styles.lightText}>
              Only child accounts can request privileges. Use the Family Overview screen to manage settings as a parent.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Available privileges</Text>
              <Text style={styles.lightText}>Tap request to send a gentle ask to your parent.</Text>
              {(privilegesQuery.data ?? []).length === 0 ? (
                <Text style={styles.lightText}>No privileges found yet.</Text>
              ) : (
                privilegesQuery.data!.map((privilege) => {
                  const lastRequest = latestByPrivilege.get(privilege.id);
                  const statusLabel = lastRequest ? statusCopy[lastRequest.status] ?? lastRequest.status : undefined;
                  const insufficientSeeds = availableSeeds < privilege.cost;
                  const isLocked = lastRequest?.status === "PENDING" || lastRequest?.status === "APPROVED";
                  const disabled = isLocked || insufficientSeeds || requestMutation.isPending;
                  return (
                    <View key={privilege.id} style={styles.privilegeRow}>
                      <View style={styles.privilegeInfo}>
                        <Text style={styles.privilegeTitle}>{privilege.title}</Text>
                        {privilege.description ? (
                          <Text style={styles.lightText}>{privilege.description}</Text>
                        ) : null}
                        <Text style={styles.privilegeCost}>{privilege.cost} seeds</Text>
                        {statusLabel ? <Text style={styles.statusHint}>{statusLabel}</Text> : null}
                        {insufficientSeeds ? (
                          <Text style={styles.warningText}>
                            Need {privilege.cost} seeds (you have {availableSeeds})
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[styles.requestButton, disabled && styles.requestButtonDisabled]}
                        disabled={disabled}
                        onPress={() => requestMutation.mutate(privilege.id)}
                      >
                        <Text style={styles.requestButtonLabel}>
                          {insufficientSeeds
                            ? "Need more seeds"
                            : lastRequest?.status === "APPROVED"
                            ? "Ticket ready"
                            : lastRequest?.status === "PENDING"
                            ? "Pending..."
                            : "Request"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.sectionTitle}>Privilege tickets</Text>
                <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/privileges/history")}>
                  <Text style={styles.linkText}>Ticket history</Text>
                </TouchableOpacity>
              </View>
              {approvedTickets.length === 0 ? (
                <Text style={styles.lightText}>No tickets yet. Earn seeds and request something fun!</Text>
              ) : (
                approvedTickets.map((ticket) => (
                  <View key={ticket.id} style={styles.ticketCard}>
                    <Text style={styles.ticketTitle}>{ticket.privilege.title}</Text>
                    <Text style={styles.ticketCost}>{ticket.cost} seeds</Text>
                    <Text style={styles.ticketMeta}>
                      Approved {new Date(ticket.resolvedAt ?? ticket.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pending requests</Text>
              {pendingRequests.length === 0 ? (
                <Text style={styles.lightText}>No pending requests. Tap a privilege to get started.</Text>
              ) : (
                pendingRequests.map((request) => (
                  <View key={request.id} style={styles.pendingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingTitle}>{request.privilege.title}</Text>
                      <Text style={styles.lightText}>{request.cost} seeds</Text>
                    </View>
                    <Text style={styles.pendingStatus}>Waiting...</Text>
                  </View>
                ))
              )}
            </View>

            {rejectedRequests.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Recently reviewed</Text>
                {rejectedRequests.map((request) => (
                  <View key={request.id} style={styles.pendingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingTitle}>{request.privilege.title}</Text>
                      <Text style={styles.lightText}>Try requesting again later.</Text>
                    </View>
                    <Text style={styles.rejectedStatus}>Rejected</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
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
    padding: 18,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#111827",
  },
  lightText: {
    color: "#94a3b8",
  },
  privilegeRow: {
    borderWidth: 1,
    borderColor: "#e0e7ff",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  privilegeInfo: {
    gap: 4,
  },
  privilegeTitle: {
    fontWeight: "600",
    color: "#1f2937",
  },
  privilegeCost: {
    color: "#4c1d95",
    fontWeight: "600",
  },
  statusHint: {
    color: "#6366f1",
    fontSize: 12,
  },
  warningText: {
    color: "#ea580c",
    fontSize: 12,
  },
  requestButton: {
    alignSelf: "flex-start",
    backgroundColor: "#6c63ff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonLabel: {
    color: "#fff",
    fontWeight: "600",
  },
  ticketCard: {
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  ticketTitle: {
    fontWeight: "600",
    color: "#92400e",
  },
  ticketCost: {
    color: "#ca8a04",
    fontWeight: "600",
  },
  ticketMeta: {
    color: "#b45309",
    fontSize: 12,
  },
  pendingRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pendingTitle: {
    fontWeight: "600",
    color: "#1f2937",
  },
  pendingStatus: {
    color: "#6c63ff",
    fontWeight: "600",
  },
  rejectedStatus: {
    color: "#dc2626",
    fontWeight: "600",
  },
  linkButton: {
    paddingVertical: 4,
  },
  linkText: {
    color: "#6c63ff",
    fontWeight: "600",
  },
});
