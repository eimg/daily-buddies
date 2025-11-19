import { useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "../../../src/context/AuthContext";
import {
  assignRoutineTemplate,
  assignTask,
  ChildTaskSummary,
  completeTask,
  createRoutineTemplate,
  createTask,
  fetchFamilyMembers,
  fetchRoutineTemplates,
  fetchTasks,
  ParentTaskSummary,
  RoutineTemplate,
  unassignRoutineTemplate,
} from "../../../src/services/api";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LABELS: Record<string, string> = {
  SUN: "Sun",
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
};

const TONE_COLORS: Record<string, string> = {
  sunrise: "#fb923c",
  forest: "#22c55e",
  ocean: "#38bdf8",
  lavender: "#c084fc",
  sunset: "#f87171",
  default: "#94a3b8",
};

export default function TasksScreen() {
  const { profile, token } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isParent = profile?.role === "PARENT";

  const tasksQuery = useQuery({
    queryKey: ["tasks", token],
    queryFn: () => fetchTasks(token!),
    enabled: !!token,
  });

  const templatesQuery = useQuery({
    queryKey: ["routine-templates", token],
    queryFn: () => fetchRoutineTemplates(token!),
    enabled: isParent && !!token,
  });

  const familyQuery = useQuery({
    queryKey: ["family-members", token],
    queryFn: () => fetchFamilyMembers(token!),
    enabled: isParent && !!token,
  });

  const invalidateTasks = async () => {
    if (!token) return;
    await queryClient.invalidateQueries({ queryKey: ["tasks", token] });
  };

  const invalidateTemplates = async () => {
    if (!token) return;
    await queryClient.invalidateQueries({ queryKey: ["routine-templates", token] });
  };

  const createTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createTask>[1]) => createTask(token!, payload),
    onSuccess: invalidateTasks,
  });

  const assignTaskMutation = useMutation({
    mutationFn: ({ taskId, childId }: { taskId: string; childId: string }) =>
      assignTask(token!, taskId, childId),
    onSuccess: invalidateTasks,
  });

  const childCompleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => completeTask(token!, taskId, { status: "COMPLETED" }),
    onSuccess: invalidateTasks,
  });

  const createTemplateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createRoutineTemplate>[1]) =>
      createRoutineTemplate(token!, payload),
    onSuccess: invalidateTemplates,
  });

  const assignTemplateMutation = useMutation({
    mutationFn: ({ templateId, childId }: { templateId: string; childId: string }) =>
      assignRoutineTemplate(token!, templateId, childId),
    onSuccess: async () => {
      await Promise.all([invalidateTasks(), invalidateTemplates()]);
    },
  });

  const unassignTemplateMutation = useMutation({
    mutationFn: ({ templateId, childId }: { templateId: string; childId: string }) =>
      unassignRoutineTemplate(token!, templateId, childId),
    onSuccess: async () => {
      await Promise.all([invalidateTasks(), invalidateTemplates()]);
    },
  });

  const [activeTab, setActiveTab] = useState<"TASKS" | "ROUTINES">("TASKS");

  const [taskForm, setTaskForm] = useState({
    title: "",
    points: "1",
    childId: "",
  });

  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    rewardNote: "",
    days: DAYS,
    items: [{ title: "", points: "1" }],
  });

  const children =
    familyQuery.data?.filter((member) => member.role === "CHILD") ?? [];

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) {
      Alert.alert("Title required", "Name your task first.");
      return;
    }

    try {
      const createdTask = (await createTaskMutation.mutateAsync({
        title: taskForm.title.trim(),
        points: Number(taskForm.points) || 1,
      })) as { id?: string };

      if (taskForm.childId && createdTask?.id) {
        await assignTaskMutation.mutateAsync({
          taskId: createdTask.id,
          childId: taskForm.childId,
        });
      }

      setTaskForm({ title: "", points: "1", childId: "" });
    } catch (error) {
      Alert.alert("Could not create task", (error as Error).message);
    }
  };

  const handleCreateTemplate = async () => {
    if (!templateForm.name.trim()) {
      Alert.alert("Template needs a name", "Give your routine a short title.");
      return;
    }

    if (!templateForm.items.length || !templateForm.items[0].title.trim()) {
      Alert.alert("Add at least one task", "Templates require at least one item.");
      return;
    }

    try {
      await createTemplateMutation.mutateAsync({
        name: templateForm.name.trim(),
        description: templateForm.description || undefined,
        rewardNote: templateForm.rewardNote || undefined,
        daysOfWeek: templateForm.days,
        items: templateForm.items.map((item) => ({
          title: item.title || "Task",
          points: Number(item.points) || 1,
        })),
      });
      setTemplateForm({
        name: "",
        description: "",
        rewardNote: "",
        days: DAYS,
        items: [{ title: "", points: "1" }],
      });
    } catch (error) {
      Alert.alert("Could not save routine", (error as Error).message);
    }
  };

  const parentView = () => {
    const tasks = (tasksQuery.data as ParentTaskSummary[]) ?? [];
    const templates = templatesQuery.data ?? [];
    const templateBusy = assignTemplateMutation.isPending || unassignTemplateMutation.isPending;
    const manualTasks = tasks.filter((task) => !task.routineName);

    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Tasks & Routines</Text>
        </View>

        <View style={styles.tabRow}>
          {(["TASKS", "ROUTINES"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={activeTab === tab ? styles.tabTextActive : styles.tabText}>
                {tab === "TASKS" ? "Tasks" : "Routines"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "TASKS" ? (
          <>
            <Section title="Quick Task">
              <Input
                placeholder="Brush teeth"
                value={taskForm.title}
                onChangeText={(value) => setTaskForm((prev) => ({ ...prev, title: value }))}
              />
              <Input
                placeholder="Points"
                keyboardType="numeric"
                value={taskForm.points}
                onChangeText={(value) => setTaskForm((prev) => ({ ...prev, points: value }))}
              />
              <ChildPicker
                children={children}
                selectedId={taskForm.childId}
                onSelect={(childId) => setTaskForm((prev) => ({ ...prev, childId }))}
              />
              <PrimaryButton title="Create Task" onPress={handleCreateTask} loading={createTaskMutation.isPending} />
            </Section>

            <Section title="Today's Tasks">
              {manualTasks.length === 0 && (
                <Text style={styles.lightText}>No standalone tasks yet.</Text>
              )}
              {manualTasks.map((task) => (
                <View key={task.id} style={styles.taskCard}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.lightText}>{task.points} seeds</Text>
                  {task.assignments.length === 0 ? (
                    <Text style={styles.lightText}>No children assigned yet.</Text>
                  ) : (
                    <Text style={styles.lightText}>
                      {task.assignments.map((assignment) => assignment.childName).join(", ")}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={styles.manageButton}
                    onPress={() => router.push(`/tasks/${task.id}`)}
                  >
                    <Text style={styles.manageButtonText}>Open Task</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/history")}>
                <Text style={styles.linkText}>View history</Text>
              </TouchableOpacity>
            </Section>
          </>
        ) : (
          <>
            <Section title="Routine Templates">
              {templates.length === 0 && (
                <Text style={styles.lightText}>No templates yet. Start with Morning Routine?</Text>
              )}
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  childrenList={children}
                  assigning={templateBusy}
                  onAssign={(childId) =>
                    assignTemplateMutation.mutate({ templateId: template.id, childId })
                  }
                  onUnassign={(childId) =>
                    unassignTemplateMutation.mutate({ templateId: template.id, childId })
                  }
                  onManage={() => router.push(`/tasks/routines/${template.id}`)}
                />
              ))}
            </Section>

            <Section title="Create a routine">
              <Input
                placeholder="Morning Glow"
                value={templateForm.name}
                onChangeText={(value) => setTemplateForm((prev) => ({ ...prev, name: value }))}
              />
              <Input
                placeholder="Optional description"
                value={templateForm.description}
                onChangeText={(value) => setTemplateForm((prev) => ({ ...prev, description: value }))}
              />
              <Input
                placeholder="Reward note"
                value={templateForm.rewardNote}
                onChangeText={(value) => setTemplateForm((prev) => ({ ...prev, rewardNote: value }))}
              />
              <View style={styles.dayRow}>
                {DAYS.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayChip,
                      templateForm.days.includes(day) && styles.dayChipActive,
                    ]}
                    onPress={() =>
                      setTemplateForm((prev) => {
                        const selected = prev.days.includes(day)
                          ? prev.days.filter((d) => d !== day)
                          : [...prev.days, day];
                        return { ...prev, days: selected };
                      })
                    }
                  >
                    <Text
                      style={
                        templateForm.days.includes(day) ? styles.dayTextActive : styles.dayText
                      }
                    >
                      {DAY_LABELS[day]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {templateForm.items.map((item, index) => (
                <View key={index} style={styles.inlineFields}>
                  <Input
                    style={styles.flexOne}
                    placeholder={`Task ${index + 1}`}
                    value={item.title}
                    onChangeText={(value) =>
                      setTemplateForm((prev) => {
                        const next = [...prev.items];
                        next[index] = { ...next[index], title: value };
                        return { ...prev, items: next };
                      })
                    }
                  />
                  <Input
                    style={styles.pointsInput}
                    placeholder="Pts"
                    keyboardType="numeric"
                    value={item.points}
                    onChangeText={(value) =>
                      setTemplateForm((prev) => {
                        const next = [...prev.items];
                        next[index] = { ...next[index], points: value };
                        return { ...prev, items: next };
                      })
                    }
                  />
                </View>
              ))}
              <TouchableOpacity
                onPress={() =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    items: [...prev.items, { title: "", points: "1" }],
                  }))
                }
              >
                <Text style={styles.link}>+ Add another task</Text>
              </TouchableOpacity>
              <PrimaryButton
                title="Save Template"
                onPress={handleCreateTemplate}
                loading={createTemplateMutation.isPending}
              />
            </Section>
          </>
        )}
      </ScrollView>
    );
  };

  const childView = () => {
    const tasks = (tasksQuery.data as ChildTaskSummary[]) ?? [];

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>My Missions</Text>
        {tasks.length === 0 && <Text style={styles.lightText}>No tasks assigned yet.</Text>}
        {tasks.map((task) => (
          <View key={task.id} style={styles.childTaskCard}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.lightText}>
              {task.points} seed{task.points === 1 ? "" : "s"}
              {task.routineName ? ` • ${task.routineName}` : ""}
            </Text>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                task.status === "COMPLETED" && styles.disabledButton,
              ]}
              disabled={task.status === "COMPLETED"}
              onPress={() => childCompleteTaskMutation.mutate(task.id)}
            >
              <Text style={styles.primaryButtonText}>
                {task.status === "COMPLETED" ? "Done" : "Mark Complete"}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  if (!token) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {isParent ? parentView() : childView()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Input = ({ style, ...props }: React.ComponentProps<typeof TextInput>) => (
  <TextInput
    style={[styles.input, style]}
    placeholderTextColor="#94a3b8"
    {...props}
  />
);

const ChildPicker = ({
  children,
  selectedId,
  onSelect,
}: {
  children: Array<{ id: string; name: string }>;
  selectedId: string;
  onSelect: (childId: string) => void;
}) => (
  <View style={styles.childSelectRow}>
    {children.length === 0 ? (
      <Text style={styles.lightText}>Add a child to assign.</Text>
    ) : (
      children.map((child) => (
        <TouchableOpacity
          key={child.id}
          style={[
            styles.childSelectButton,
            child.id === selectedId && styles.childSelectButtonActive,
          ]}
          onPress={() => onSelect(child.id)}
        >
          <Text
            style={[
              styles.childSelectLabel,
              child.id === selectedId && styles.childSelectLabelActive,
            ]}
          >
            {child.name}
          </Text>
        </TouchableOpacity>
      ))
    )}
  </View>
);

const TemplateCard = ({
  template,
  childrenList,
  assigning,
  onAssign,
  onUnassign,
  onManage,
}: {
  template: RoutineTemplate;
  childrenList: Array<{ id: string; name: string }>;
  assigning: boolean;
  onAssign: (childId: string) => void;
  onUnassign: (childId: string) => void;
  onManage: () => void;
}) => {
  const assignedMap = new Map((template.assignments ?? []).map((assignment) => [assignment.childId, assignment]));
  return (
  <View style={styles.templateCard}>
    <Text style={styles.taskTitle}>{template.name}</Text>
    <Text style={styles.lightText}>{template.items.length} tasks inside</Text>
    <View style={styles.dayRow}>
      {(template.daysOfWeek ?? DAYS).map((day) => (
        <View key={day} style={styles.dayBadge}>
          <Text style={styles.dayTextActive}>{DAY_LABELS[day]}</Text>
        </View>
      ))}
    </View>
    {template.rewardNote ? (
      <Text style={styles.lightText}>Reward: {template.rewardNote}</Text>
    ) : null}
    {template.assignments && template.assignments.length > 0 && (
      <View style={styles.assignmentRow}>
        {template.assignments.map((assignment) => (
          <View
            key={assignment.id ?? `${template.id}-${assignment.childId}`}
            style={styles.assignmentPill}
          >
            <View
              style={[
                styles.avatarDot,
                { backgroundColor: TONE_COLORS[assignment.childAvatarTone ?? "default"] ?? TONE_COLORS.default },
              ]}
            />
            <Text style={styles.assignmentText}>{assignment.childName}</Text>
          </View>
        ))}
      </View>
    )}
    <View style={styles.childButtons}>
      {childrenList.length === 0 ? (
        <Text style={styles.lightText}>Add a child to assign this routine.</Text>
      ) : (
        childrenList.map((child) => (
          <TouchableOpacity
            key={child.id}
            style={[
              styles.assignButton,
              assignedMap.has(child.id) && styles.assignButtonActive,
              assigning && styles.disabledButton,
            ]}
            onPress={() =>
              assignedMap.has(child.id) ? onUnassign(child.id) : onAssign(child.id)
            }
            disabled={assigning}
          >
            <Text
              style={[
                styles.assignButtonText,
                assignedMap.has(child.id) && styles.assignButtonTextActive,
              ]}
            >
              {assignedMap.has(child.id) ? `Remove ${child.name}` : `Assign ${child.name}`}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </View>
    <TouchableOpacity style={styles.manageButton} onPress={onManage}>
      <Text style={styles.manageButtonText}>Open Routine</Text>
    </TouchableOpacity>
  </View>
);
};

const PrimaryButton = ({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
}) => (
  <TouchableOpacity
    style={[styles.primaryButton, loading && styles.disabledButton]}
    disabled={loading}
    onPress={onPress}
  >
    <Text style={styles.primaryButtonText}>{loading ? "Please wait..." : title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f6f4ff",
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2933",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#ede9fe",
    borderRadius: 20,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tabText: {
    color: "#6b7280",
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#4c1d95",
    fontWeight: "700",
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
  section: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  sectionSubtitle: {
    fontWeight: "600",
    color: "#4b5563",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  inlineFields: {
    flexDirection: "row",
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  pointsInput: {
    width: 80,
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayBadge: {
    borderWidth: 1,
    borderColor: "#e0e7ff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#eef2ff",
  },
  childSelectRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  childSelectButton: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  childSelectButtonActive: {
    backgroundColor: "#ede9fe",
    borderColor: "#c4b5fd",
  },
  childSelectLabel: {
    color: "#475569",
  },
  childSelectLabelActive: {
    color: "#4c1d95",
    fontWeight: "600",
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
  disabledButton: {
    opacity: 0.6,
  },
  lightText: {
    color: "#94a3b8",
  },
  linkButton: {
    marginTop: 10,
  },
  linkText: {
    color: "#6c63ff",
    fontWeight: "600",
  },
  link: {
    color: "#6c63ff",
    fontWeight: "600",
  },
  taskCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  childTaskCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 18,
    padding: 16,
    gap: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  assignmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  assignmentPill: {
    backgroundColor: "#eef2ff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assignmentText: {
    color: "#4f46e5",
    fontSize: 12,
  },
  childButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  assignButton: {
    borderWidth: 1,
    borderColor: "#c4b5fd",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assignButtonActive: {
    backgroundColor: "#eef2ff",
    borderColor: "#a5b4fc",
  },
  assignButtonText: {
    color: "#6c63ff",
    fontSize: 12,
    fontWeight: "500",
  },
  assignButtonTextActive: {
    color: "#4338ca",
    fontWeight: "600",
  },
  templateCard: {
    borderWidth: 1,
    borderColor: "#ede9fe",
    borderRadius: 20,
    padding: 14,
    gap: 6,
  },
  dayChip: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayChipActive: {
    backgroundColor: "#ede9fe",
    borderColor: "#c4b5fd",
  },
  dayText: {
    color: "#475569",
  },
  dayTextActive: {
    color: "#4c1d95",
    fontWeight: "600",
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
  avatarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  manageButton: {
    marginTop: 12,
    backgroundColor: "#eef2ff",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  manageButtonText: {
    color: "#4338ca",
    fontWeight: "600",
  },
});
