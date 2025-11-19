import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../../src/context/AuthContext";
import { fetchPrivilegeRequests, fetchMyPrivilegeRequests } from "../../../src/services/api";

const formatDate = (value?: string | null) => {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleDateString();
};

export default function PrivilegeHistoryScreen() {
  const router = useRouter();
  const { token, profile } = useAuth();
  const isParent = profile?.role === "PARENT";

  const historyQuery = useQuery({
    queryKey: ["privilege-history", token, isParent ? "parent" : "child"],
    queryFn: () => (isParent ? fetchPrivilegeRequests(token!) : fetchMyPrivilegeRequests(token!)),
    enabled: !!token,
  });

  if (!token) {
    return null;
  }

  const entries = (historyQuery.data ?? []).filter((entry) => entry.status === "TERMINATED");

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>{isParent ? "Ticket History 📜" : "My Tickets 📜"}</Text>
        </View>
        <Text style={styles.subtitle}>
          {isParent ? "Review every ticket that was closed." : "Here’s where ended tickets live."}
        </Text>

        {historyQuery.isError ? (
          <Text style={styles.lightText}>
            {(historyQuery.error as Error)?.message ?? "Unable to load history right now."}
          </Text>
        ) : entries.length === 0 ? (
          <Text style={styles.lightText}>No terminated tickets yet.</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.historyCard}>
              <Text style={styles.ticketTitle}>{entry.privilege.title}</Text>
              <Text style={styles.ticketMeta}>
                Cost: <Text style={styles.bold}>{entry.cost} seeds</Text>
              </Text>
              {isParent ? (
                <Text style={styles.ticketMeta}>
                  Child: <Text style={styles.bold}>{entry.childName ?? "Unknown"}</Text>
                </Text>
              ) : null}
              <Text style={styles.ticketMeta}>Ended: {formatDate(entry.resolvedAt ?? entry.createdAt)}</Text>
              {entry.note ? <Text style={styles.note}>Note: {entry.note}</Text> : null}
            </View>
          ))
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
  lightText: {
    color: "#94a3b8",
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  ticketTitle: {
    fontWeight: "600",
    color: "#1f2937",
  },
  ticketMeta: {
    color: "#475569",
  },
  note: {
    color: "#dc2626",
    fontStyle: "italic",
  },
  bold: {
    fontWeight: "600",
    color: "#1f2937",
  },
});
