import { ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "../../../../src/context/AuthContext";
import {
  fetchFamilyMembers,
  inviteParent,
  createChild,
  updateFamilyMember,
  deleteFamilyMember,
  deleteFamilyAccount,
  type FamilyMember,
} from "../../../../src/services/api";

export default function ParentManageScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const isAuthenticated = Boolean(token);

  const membersQuery = useQuery({
    queryKey: ["family-members", token],
    queryFn: () => {
      if (!token) {
        throw new Error("Not authenticated");
      }
      return fetchFamilyMembers(token);
    },
    enabled: isAuthenticated,
  });

  const members = membersQuery.data ?? [];
  const parents = members.filter((member) => member.role === "PARENT");
  const children = members.filter((member) => member.role === "CHILD");

  const [parentForm, setParentForm] = useState({ name: "", username: "", email: "", password: "" });
  const [childForm, setChildForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    avatarTone: "sunrise",
  });

  const invalidate = () => {
    if (!token) return;
    return queryClient.invalidateQueries({ queryKey: ["family-members", token] });
  };

  const inviteParentMutation = useMutation({
    mutationFn: (payload: Parameters<typeof inviteParent>[1]) => {
      if (!token) {
        throw new Error("Not authenticated");
      }
      return inviteParent(token, payload);
    },
    onSuccess: invalidate,
  });

  const createChildMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createChild>[1]) => {
      if (!token) {
        throw new Error("Not authenticated");
      }
      return createChild(token, payload);
    },
    onSuccess: invalidate,
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: Parameters<typeof updateFamilyMember>[2];
    }) => {
      if (!token) {
        throw new Error("Not authenticated");
      }
      return updateFamilyMember(token, userId, payload);
    },
    onSuccess: invalidate,
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!token) {
        throw new Error("Not authenticated");
      }
      return deleteFamilyMember(token, userId);
    },
    onSuccess: invalidate,
  });

  const deleteFamilyMutation = useMutation({
    mutationFn: () => {
      if (!token) {
        throw new Error("Not authenticated");
      }
      return deleteFamilyAccount(token);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      router.replace("/login");
    },
    onError: (error: Error) => {
      Alert.alert("Unable to delete family", error.message);
    },
  });

  const handleInviteParent = () => {
    if (!parentForm.name || !parentForm.username || !parentForm.email || !parentForm.password) {
      return;
    }
    inviteParentMutation.mutate({
      name: parentForm.name.trim(),
      username: parentForm.username.trim().toLowerCase(),
      email: parentForm.email.trim().toLowerCase(),
      password: parentForm.password,
    });
    setParentForm({ name: "", username: "", email: "", password: "" });
  };

  const handleAddChild = () => {
    if (!childForm.name || !childForm.username || !childForm.password) {
      return;
    }
    createChildMutation.mutate({
      name: childForm.name.trim(),
      username: childForm.username.trim().toLowerCase(),
      email: childForm.email ? childForm.email.trim().toLowerCase() : undefined,
      password: childForm.password,
      avatarTone: childForm.avatarTone || undefined,
    });
    setChildForm({ name: "", username: "", email: "", password: "", avatarTone: "sunrise" });
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.lightText}>Connecting to your family...</Text>
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
          <Text style={styles.header}>Family Hub 👨‍👩‍👧</Text>
        </View>

        <Text style={styles.sectionTitle}>Parents</Text>
        {parents.map((parent, index) => (
          <MemberRow
            key={parent.id}
            member={parent}
            onSave={(payload) => updateMemberMutation.mutate({ userId: parent.id, payload })}
            onRemove={
              index === 0
                ? undefined
                : () =>
                    Alert.alert(
                      "Remove parent?",
                      "This parent will lose access to the family account.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => deleteMemberMutation.mutate(parent.id),
                        },
                      ],
                    )
            }
          />
        ))}

        <View style={styles.inviteCard}>
          <Text style={styles.sectionTitle}>Invite another parent</Text>
          <Input
            placeholder="Name"
            value={parentForm.name}
            onChangeText={(value: string) => setParentForm((prev) => ({ ...prev, name: value }))}
          />
          <Input
            placeholder="Username"
            autoCapitalize="none"
            value={parentForm.username}
            onChangeText={(value: string) => setParentForm((prev) => ({ ...prev, username: value }))}
          />
          <Input
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={parentForm.email}
            onChangeText={(value: string) => setParentForm((prev) => ({ ...prev, email: value }))}
          />
          <Input
            placeholder="Password"
            secureTextEntry
            value={parentForm.password}
            onChangeText={(value: string) => setParentForm((prev) => ({ ...prev, password: value }))}
          />
          <PrimaryButton title="Send Invite" onPress={handleInviteParent} />
        </View>

        <Text style={styles.sectionTitle}>Children</Text>
        {children.map((child) => (
          <MemberRow
            key={child.id}
            member={child}
            onSave={(payload) => updateMemberMutation.mutate({ userId: child.id, payload })}
            onRemove={() =>
              Alert.alert(
                "Remove child?",
                "Their tasks, routines, and rewards history will also be deleted.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => deleteMemberMutation.mutate(child.id),
                  },
                ],
              )
            }
          />
        ))}

        <View style={styles.inviteCard}>
          <Text style={styles.sectionTitle}>Add a child</Text>
          <Input
            placeholder="Name"
            value={childForm.name}
            onChangeText={(value: string) => setChildForm((prev) => ({ ...prev, name: value }))}
          />
          <Input
            placeholder="Username"
            autoCapitalize="none"
            value={childForm.username}
            onChangeText={(value: string) => setChildForm((prev) => ({ ...prev, username: value }))}
          />
          <Input
            placeholder="Email (optional)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={childForm.email}
            onChangeText={(value: string) => setChildForm((prev) => ({ ...prev, email: value }))}
          />
          <Input
            placeholder="Password"
            secureTextEntry
            value={childForm.password}
            onChangeText={(value: string) => setChildForm((prev) => ({ ...prev, password: value }))}
          />
          <TonePicker value={childForm.avatarTone} onChange={(avatarTone) => setChildForm((prev) => ({ ...prev, avatarTone }))} />
          <PrimaryButton title="Add Child" onPress={handleAddChild} />
        </View>

        <View style={styles.dangerCard}>
          <Text style={styles.sectionTitle}>Delete family account</Text>
          <Text style={styles.warningText}>
            This will permanently remove all accounts, data, and rewards for this family. This action
            cannot be undone.
          </Text>
          <TouchableOpacity
            style={[styles.deleteButton, deleteFamilyMutation.isPending && styles.disabledButton]}
            onPress={() =>
              Alert.alert(
                "Delete family?",
                "This will permanently erase your family data.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteFamilyMutation.mutate() },
                ],
              )
            }
            disabled={deleteFamilyMutation.isPending}
          >
            <Text style={styles.deleteButtonText}>
              {deleteFamilyMutation.isPending ? "Deleting..." : "Delete Family"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const MemberRow = ({
  member,
  onSave,
  onRemove,
}: {
  member: FamilyMember;
  onSave: (payload: { name?: string; username?: string; avatarTone?: string | null; newPassword?: string }) => void;
  onRemove?: () => void;
}) => {
  const [name, setName] = useState(member.name);
  const [handle, setHandle] = useState(member.username);
  const [tone, setTone] = useState(member.avatarTone ?? "sunrise");
  const [password, setPassword] = useState("");

  return (
    <View style={styles.memberRow}>
      <Text style={styles.memberName}>{member.name}</Text>
      <Text style={styles.lightText}>
        {member.email ? `Email: ${member.email}` : "No email on file"}
      </Text>
      <Input placeholder="Display name" value={name} onChangeText={(value) => setName(value)} />
      <Input
        placeholder="Username"
        autoCapitalize="none"
        value={handle}
        onChangeText={(value) => setHandle(value)}
      />
      <TonePicker value={tone} onChange={setTone} />
      <Input
        placeholder="New password"
        value={password}
        onChangeText={(value) => setPassword(value)}
        secureTextEntry
      />
      <PrimaryButton
        title="Save"
        onPress={() => {
          const nextUsername = handle.trim().toLowerCase();
          onSave({
            name: name.trim(),
            username: nextUsername || undefined,
            avatarTone: tone || null,
            newPassword: password || undefined,
          });
          setPassword("");
        }}
      />
      {onRemove && (
        <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
};

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
        <View
          style={[
            styles.toneDot,
            { backgroundColor: TONE_COLORS[tone] },
          ]}
        />
        <Text style={value === tone ? styles.toneTextActive : styles.toneText}>{tone}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const Input = ({ style, ...props }: React.ComponentProps<typeof TextInput>) => (
  <TextInput style={[styles.input, style]} placeholderTextColor="#94a3b8" {...props} />
);

const PrimaryButton = ({ title, onPress }: { title: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.primaryButton} onPress={onPress}>
    <Text style={styles.primaryText}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f6f4ff",
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
  sectionTitle: {
    fontWeight: "700",
    color: "#111827",
  },
  lightText: {
    color: "#94a3b8",
  },
  inviteCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  memberRow: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
  },
  memberName: {
    fontWeight: "600",
    color: "#1f2937",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
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
  primaryButton: {
    backgroundColor: "#6c63ff",
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  removeButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  removeButtonText: {
    color: "#dc2626",
    fontWeight: "600",
  },
  dangerCard: {
    backgroundColor: "#fff4f4",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  warningText: {
    color: "#b91c1c",
    lineHeight: 18,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#dc2626",
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
