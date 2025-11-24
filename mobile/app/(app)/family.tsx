import { SafeAreaView } from "react-native-safe-area-context";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../src/context/AuthContext";
import { fetchFamilyOverview, FamilyOverviewEntry } from "../../src/services/api";

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
  default: "#94a3b8",
};

const getToneColor = (tone?: string | null) => TONE_COLORS[tone ?? ""] ?? TONE_COLORS.default;

export default function FamilyScreen() {
  const router = useRouter();
  const { token, logout, profile } = useAuth();
  
  const overviewQuery = useQuery({
    queryKey: ["family-overview", token],
    queryFn: () => fetchFamilyOverview(token!),
    enabled: !!token,
    staleTime: 60_000,
  });

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      Alert.alert("Unable to log out", (error as Error).message);
    }
  };

  if (!token) {
    return null;
  }

  const members = overviewQuery.data ?? [];

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
          <Text style={styles.header}>Family Hub 🌼</Text>
        </View>

          <Text style={styles.subtitle}>Accounts and progress at a glance.</Text>

          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/family/manage/parents")}
          >
            <Text style={styles.primaryButtonText}>Manage Accounts</Text>
          </TouchableOpacity>

          {profile?.role === "PARENT" && (
            <>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => router.push("/family/rewards")}
              >
                <Text style={styles.ghostText}>Streak Rewards</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => router.push("/family/privileges")}
              >
                <Text style={styles.ghostText}>Manage Privileges</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => router.push("/family/nudges")}
              >
                <Text style={styles.ghostText}>Nudges & Reminders</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => router.push("/points")}
              >
                <Text style={styles.ghostText}>Gifts & Penalties</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const humanizeStatLabel = (label: string) => {
  const spaced = label
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const MemberCard = ({ member }: { member: FamilyOverviewEntry }) => {
  const statsEntries = Object.entries(member.stats ?? {});
  const roleLabel = member.role === "CHILD" ? "Child" : "Parent";

  return (
    <View style={styles.card}>
      <View style={styles.memberTop}>
        <View style={styles.nameRow}>
          <View
            style={[
              styles.avatarDot,
              { backgroundColor: getToneColor(member.avatarTone) },
            ]}
          />
          <View style={styles.nameBlock}>
            <Text style={styles.cardTitle}>{member.name}</Text>
            <Text style={styles.usernameChip}>@{member.username}</Text>
          </View>
        </View>
        <View
          style={[
            styles.rolePill,
            member.role === "CHILD" ? styles.roleChild : styles.roleParent,
          ]}
        >
          <Text
            style={[
              styles.roleText,
              member.role === "CHILD" ? styles.roleTextChild : styles.roleTextParent,
            ]}
          >
            {roleLabel}
          </Text>
        </View>
      </View>
      {statsEntries.length === 0 ? (
        <Text style={styles.lightText}>No stats yet.</Text>
      ) : (
        <View style={styles.statsGrid}>
          {statsEntries.map(([label, value]) => (
            <View key={label} style={styles.statCard}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{humanizeStatLabel(label)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

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
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  memberTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  nameBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  avatarDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  cardSubtitle: {
    color: "#94a3b8",
  },
  usernameChip: {
    color: "#6b7280",
    fontSize: 12,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    backgroundColor: "#f3f4ff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 110,
    flexGrow: 1,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  statValue: {
    fontWeight: "700",
    color: "#1f2937",
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  roleChild: {
    backgroundColor: "#ecfeff",
    borderColor: "#bae6fd",
  },
  roleParent: {
    backgroundColor: "#f4f3ff",
    borderColor: "#e0e7ff",
  },
  roleText: {
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
  },
  roleTextChild: {
    color: "#0369a1",
  },
  roleTextParent: {
    color: "#4338ca",
  },
  lightText: {
    color: "#94a3b8",
  },
  actions: {
    marginTop: 12,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#6c63ff",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  ghostButton: {
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  ghostText: {
    color: "#4b5563",
    fontWeight: "600",
  },
});
