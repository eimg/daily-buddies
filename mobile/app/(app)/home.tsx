import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	Animated,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { useAuth } from "../../src/context/AuthContext";
import {
	fetchTasks,
	ParentTaskSummary,
	ChildTaskSummary,
	completeTask,
	fetchFamilyStreakSettings,
	fetchPrivilegeRequests,
	fetchMyPrivilegeRequests,
	PrivilegeRequestEntry,
} from "../../src/services/api";

type ProfileShape = ReturnType<typeof useAuth>["profile"];

const toneColors: Record<string, string> = {
	sunrise: "#fb923c",
	forest: "#22c55e",
	ocean: "#38bdf8",
	lavender: "#c084fc",
	sunset: "#f87171",
	default: "#94a3b8",
};

const CONFETTI_COLORS = ["#f97316", "#fbbf24", "#22c55e", "#38bdf8", "#c084fc"];

const ConfettiBurst = ({ trigger }: { trigger: number }) => {
	const [visible, setVisible] = useState(false);
	const animation = useRef(new Animated.Value(0)).current;

	const pieces = useMemo(
		() =>
			Array.from({ length: 14 }).map(() => ({
				left: Math.random(),
				drift: Math.random() * 80 - 40,
				fall: 140 + Math.random() * 80,
				color: CONFETTI_COLORS[
					Math.floor(Math.random() * CONFETTI_COLORS.length)
				],
				rotate: `${Math.random() * 120 - 60}deg`,
			})),
		[trigger]
	);

	useEffect(() => {
		if (!trigger) return;
		setVisible(true);
		animation.setValue(0);
		Animated.timing(animation, {
			toValue: 1,
			duration: 1200,
			useNativeDriver: true,
		}).start(() => setVisible(false));
	}, [trigger, animation]);

	if (!visible) {
		return null;
	}

	return (
		<View
			pointerEvents="none"
			style={styles.confettiContainer}>
			{pieces.map((piece, index) => (
				<Animated.View
					key={`${trigger}-${index}`}
					style={[
						styles.confettiPiece,
						{
							left: `${piece.left * 100}%`,
							backgroundColor: piece.color,
							transform: [
								{
									translateY: animation.interpolate({
										inputRange: [0, 1],
										outputRange: [0, piece.fall],
									}),
								},
								{
									translateX: animation.interpolate({
										inputRange: [0, 1],
										outputRange: [0, piece.drift],
									}),
								},
								{ rotate: piece.rotate },
							],
							opacity: animation.interpolate({
								inputRange: [0, 0.8, 1],
								outputRange: [1, 1, 0],
							}),
						},
					]}
				/>
			))}
		</View>
	);
};

const getToneColor = (tone?: string | null) =>
	toneColors[tone ?? ""] ?? toneColors.default;

const formatTicketDate = (value?: string | null) => {
	if (!value) {
		return "Pending";
	}
	return new Date(value).toLocaleDateString();
};

export default function HomeScreen() {
	const { profile, token } = useAuth();

	if (!token) {
		return null;
	}

	if (profile?.role === "PARENT") {
		return (
			<ParentHome
				token={token}
				profile={profile}
			/>
		);
	}

	return (
		<ChildHome
			token={token}
			profile={profile}
		/>
	);
}

const ParentHome = ({
	token,
	profile,
}: {
	token: string;
	profile: ProfileShape;
}) => {
	const router = useRouter();
	const tasksQuery = useQuery({
		queryKey: ["home-parent-tasks", token],
		queryFn: () => fetchTasks(token),
		staleTime: 30_000,
	});
	const privilegeQuery = useQuery({
		queryKey: ["home-parent-privileges", token],
		queryFn: () => fetchPrivilegeRequests(token),
		staleTime: 30_000,
	});

	const tasks = (tasksQuery.data as ParentTaskSummary[]) ?? [];
	const privilegeRequests = privilegeQuery.data ?? [];
	const pendingPrivileges = privilegeRequests
		.filter(request => request.status === "PENDING")
		.slice(0, 3);
	const activePrivilegeTickets = privilegeRequests
		.filter(request => request.status === "APPROVED")
		.slice(0, 3);

	const pendingAssignments = tasks.flatMap(task =>
		task.assignments
			.filter(assignment => assignment.status !== "COMPLETED")
			.map(assignment => ({
				taskTitle: task.title,
				childName: assignment.childName,
				childAvatarTone: assignment.childAvatarTone,
				routineName: task.routineName,
			}))
	);

	const completedAssignments = tasks.flatMap(task =>
		task.assignments
			.filter(assignment => assignment.status === "COMPLETED")
			.map(assignment => ({
				taskTitle: task.title,
				childName: assignment.childName,
				childAvatarTone: assignment.childAvatarTone,
			}))
	);

	return (
		<SafeAreaView style={styles.safe}>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.greeting}>
					Hi {profile?.name ?? "there"} 👋
				</Text>
				<Text style={styles.subtitle}>
					You’re guiding today’s rituals.
				</Text>

				<View style={styles.card}>
					<Text style={styles.cardLabel}>Family</Text>
					<Text style={styles.cardValue}>
						{profile?.family?.name ?? "Not linked yet"}
					</Text>
				</View>

				<View style={styles.card}>
					<Text style={styles.sectionTitle}>Today's Assignments</Text>
					{pendingAssignments.length === 0 ? (
						<Text style={styles.lightText}>
							All set! No tasks pending right now.
						</Text>
					) : (
						pendingAssignments
							.slice(0, 4)
							.map((assignment, index) => (
								<View
									key={`${assignment.taskTitle}-${index}`}
									style={styles.assignmentRow}>
									<View
										style={[
											styles.avatarDot,
											{
												backgroundColor: getToneColor(
													assignment.childAvatarTone
												),
											},
										]}
									/>
									<View style={styles.assignmentInfo}>
										<Text style={styles.assignmentTask}>
											{assignment.taskTitle}
										</Text>
										<Text
											style={styles.assignmentChild}
											numberOfLines={1}>
											{assignment.childName}
											{assignment.routineName
												? ` • ${assignment.routineName}`
												: ""}
										</Text>
									</View>
								</View>
							))
					)}
					<TouchableOpacity
						style={styles.linkButton}
						onPress={() => router.push("/history")}>
						<Text style={styles.linkText}>View history</Text>
					</TouchableOpacity>
				</View>

				{completedAssignments.length > 0 && (
					<View style={styles.card}>
						<Text style={styles.sectionTitle}>Recent Wins</Text>
						{completedAssignments
							.slice(0, 4)
							.map((entry, index) => (
								<View
									key={`${entry.taskTitle}-${index}`}
									style={styles.assignmentRow}>
									<View
										style={[
											styles.avatarDot,
											{
												backgroundColor: getToneColor(
													entry.childAvatarTone
												),
											},
										]}
									/>
									<View style={styles.assignmentInfo}>
										<Text style={styles.assignmentChild}>
											{entry.childName} finished{" "}
											{entry.taskTitle}
										</Text>
									</View>
								</View>
							))}
					</View>
				)}

				<View style={styles.card}>
					<View style={styles.cardHeader}>
						<Text style={styles.sectionTitle}>Privileges</Text>
						<TouchableOpacity
							style={styles.linkButton}
							onPress={() => router.push("/family/privileges")}>
							<Text style={styles.linkText}>Manage</Text>
						</TouchableOpacity>
					</View>
					<Text style={styles.cardLabel}>Pending requests</Text>
					{pendingPrivileges.length === 0 ? (
						<Text style={styles.lightText}>
							No pending requests right now.
						</Text>
					) : (
						pendingPrivileges.map(request => (
							<View
								key={request.id}
								style={styles.assignmentRow}>
								<View
									style={[
										styles.avatarDot,
										{
											backgroundColor: getToneColor(
												request.childAvatarTone
											),
										},
									]}
								/>
								<View style={styles.assignmentInfo}>
									<Text style={styles.assignmentTask}>
										{request.privilege.title}
									</Text>
									<Text style={styles.assignmentChild}>
										{request.childName ?? "Unknown child"} •{" "}
										{request.cost} seeds
									</Text>
								</View>
							</View>
						))
					)}
					<Text style={styles.cardLabel}>Active tickets</Text>
					{activePrivilegeTickets.length === 0 ? (
						<Text style={styles.lightText}>No active tickets.</Text>
					) : (
						activePrivilegeTickets.map(ticket => (
							<View
								key={ticket.id}
								style={styles.assignmentRow}>
								<View
									style={[
										styles.avatarDot,
										{
											backgroundColor: getToneColor(
												ticket.childAvatarTone
											),
										},
									]}
								/>
								<View style={styles.assignmentInfo}>
									<Text style={styles.assignmentTask}>
										{ticket.privilege.title}
									</Text>
									<Text style={styles.assignmentChild}>
										{ticket.childName ?? "Unknown child"} •{" "}
										{ticket.cost} seeds
									</Text>
								</View>
							</View>
						))
					)}
				</View>

				<View style={styles.actions}>
					<TouchableOpacity
						style={styles.primaryButton}
						onPress={() => router.push("/tasks")}>
						<Text style={styles.buttonText}>Tasks & Routines</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.ghostButton}
						onPress={() => router.push("/family")}>
						<Text style={styles.ghostText}>Family Overview</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.ghostButton}
						onPress={() => router.push("/profile")}>
						<Text style={styles.ghostText}>Profile</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

const ChildHome = ({
	token,
	profile,
}: {
	token: string;
	profile: ProfileShape;
}) => {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [expandedTask, setExpandedTask] = useState<string | null>(null);
	const [confettiTrigger, setConfettiTrigger] = useState(0);

	const tasksQuery = useQuery({
		queryKey: ["home-child-tasks", token],
		queryFn: () => fetchTasks(token),
		staleTime: 30_000,
	});
	const streakSettingsQuery = useQuery({
		queryKey: ["family-streaks", token],
		queryFn: () => fetchFamilyStreakSettings(token),
		enabled: !!token,
	});
	const privilegeRequestsQuery = useQuery({
		queryKey: ["home-child-privileges", token],
		queryFn: () => fetchMyPrivilegeRequests(token),
		staleTime: 15_000,
	});

	const toggleTask = (taskId: string) => {
		setExpandedTask(prev => (prev === taskId ? null : taskId));
	};

	const completeMutation = useMutation({
		mutationFn: ({
			taskId,
			status,
		}: {
			taskId: string;
			status: "COMPLETED" | "PENDING";
		}) => completeTask(token, taskId, { status }),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["home-child-tasks", token],
			});
			queryClient.invalidateQueries({ queryKey: ["profile", token] });
			if (variables.status === "COMPLETED") {
				setConfettiTrigger(prev => prev + 1);
			}
		},
	});

	const tasks = (tasksQuery.data as ChildTaskSummary[]) ?? [];
	const manualTasks = tasks.filter(task => !task.routineName);
	const routineGroups = useMemo(() => {
		const groups: Record<
			string,
			{
				id: string;
				name: string;
				tasks: ChildTaskSummary[];
				daysOfWeek?: string[] | null;
			}
		> = {};
		tasks
			.filter(task => !!task.routineName && task.routineId)
			.forEach(task => {
				const key = task.routineId as string;
				if (!groups[key]) {
					groups[key] = {
						id: key,
						name: task.routineName ?? "Routine",
						tasks: [],
						daysOfWeek: task.daysOfWeek,
					};
				}
				groups[key].tasks.push(task);
			});
		return Object.values(groups);
	}, [tasks]);
	const privilegeRequests =
		(privilegeRequestsQuery.data as PrivilegeRequestEntry[]) ?? [];
	const childActiveTickets = privilegeRequests.filter(
		request => request.status === "APPROVED"
	);
	const childPendingRequests = privilegeRequests.filter(
		request => request.status === "PENDING"
	);

	const completedCount = tasks.filter(
		task => task.status === "COMPLETED"
	).length;
	const remainingTasks = Math.max(tasks.length - completedCount, 0);
	const streakCount = profile?.progress?.streak ?? 0;
	const streakSettings = streakSettingsQuery.data;
	const streakGoals = [
		{ label: "Daily", threshold: 1, reward: streakSettings?.dailyStreakReward ?? 0 },
		{ label: "Weekly", threshold: 7, reward: streakSettings?.weeklyStreakReward ?? 0 },
		{ label: "Monthly", threshold: 31, reward: streakSettings?.monthlyStreakReward ?? 0 },
	].filter(goal => goal.reward > 0);
	const maxThreshold = streakGoals.length ? streakGoals[streakGoals.length - 1].threshold : 0;
	const streakProgress =
		maxThreshold > 0
			? Math.min(streakCount / maxThreshold, 1)
			: streakGoals.length > 0
			? streakCount > 0
				? 1
				: 0
			: 0;

	return (
		<SafeAreaView style={styles.safe}>
			<View style={styles.screen}>
				<ConfettiBurst trigger={confettiTrigger} />
				<ScrollView contentContainerStyle={styles.container}>
					<Text style={styles.greeting}>
						Hi {profile?.name ?? "there"} 👋
					</Text>
					<Text style={styles.subtitle}>
						Ready to turn chores into small adventures?
					</Text>

					<View style={styles.card}>
						<Text style={styles.cardLabel}>Family</Text>
						<Text style={styles.cardValue}>
							{profile?.family?.name ?? "Not linked yet"}
						</Text>
					</View>

					<View style={[styles.card, styles.progressCard]}>
						<Text style={styles.cardLabel}>Today</Text>
						<Text style={styles.cardValue}>
							{completedCount} / {tasks.length} tasks done
						</Text>
						<Text style={styles.seedDetail}>
							Seeds: {profile?.progress?.seedBalance ?? 0}
						</Text>
						<Text style={styles.lightText}>
							{remainingTasks === 0
								? "You’ve done every step today."
								: `${remainingTasks} more ${
										remainingTasks === 1 ? "step" : "steps"
								  } to finish strong.`}
						</Text>
					</View>

					<View style={styles.card}>
						<View style={[styles.cardHeader, styles.cardHeaderTight]}>
							<Text style={styles.sectionTitle}>
								My Privileges
							</Text>
							<TouchableOpacity
								onPress={() => router.push("/privileges")}>
								<Text style={styles.linkText}>Open</Text>
							</TouchableOpacity>
						</View>
						{childActiveTickets.length > 0 && (
							<>
								<Text style={styles.cardLabel}>
									Active tickets
								</Text>
								{childActiveTickets.map(ticket => (
									<View
										key={ticket.id}
										style={styles.privilegeItem}>
										<View style={styles.privilegeInfoStack}>
											<Text style={styles.assignmentTask}>
												{ticket.privilege.title}
											</Text>
											<Text style={styles.privilegeMeta}>
												{ticket.cost} seeds • Approved{" "}
												{formatTicketDate(
													ticket.resolvedAt ??
														ticket.createdAt
												)}
											</Text>
											{ticket.note ? (
												<Text style={styles.lightText}>
													Note: {ticket.note}
												</Text>
											) : null}
										</View>
										<View
											style={[
												styles.statusPill,
												styles.statusPillCompleted,
											]}>
											<Text style={styles.statusPillText}>
												Active
											</Text>
										</View>
									</View>
								))}
							</>
						)}
						{childPendingRequests.length > 0 && (
							<>
								<Text style={styles.cardLabel}>
									Pending requests
								</Text>
								{childPendingRequests.map(request => (
									<View
										key={request.id}
										style={styles.privilegeItem}>
										<View style={styles.privilegeInfoStack}>
											<Text style={styles.assignmentTask}>
												{request.privilege.title}
											</Text>
											<Text style={styles.privilegeMeta}>
												{request.cost} seeds • Requested{" "}
												{formatTicketDate(
													request.createdAt
												)}
											</Text>
										</View>
										<View
											style={[
												styles.statusPill,
												styles.statusPillPending,
											]}>
											<Text style={styles.statusPillText}>
												Pending
											</Text>
										</View>
									</View>
								))}
							</>
						)}
					</View>

					{streakGoals.length > 0 && (
						<View style={styles.streakCard}>
							<View style={styles.streakHeader}>
								<Text style={styles.sectionTitle}>
									Streak Rewards
								</Text>
								<Text style={styles.streakValue}>
									{streakCount} days
								</Text>
							</View>
							<View style={styles.streakBar}>
								<View
									style={[
										styles.streakBarFill,
										{
											width: `${streakProgress * 100}%`,
										},
									]}
								/>
								{maxThreshold > 0 &&
									streakGoals.map(goal => (
										<View
											key={goal.label}
											style={[
												styles.streakMarker,
												{
													left: `${
														(goal.threshold /
															maxThreshold) *
														100
													}%`,
												},
											]}>
											<View
												style={styles.streakMarkerDot}
											/>
										</View>
									))}
							</View>
							<View style={styles.streakGoalRow}>
								{streakGoals.map(goal => (
									<View
										key={goal.label}
										style={styles.streakGoal}>
										<Text style={styles.streakGoalLabel}>
											{goal.label}
										</Text>
										<Text style={styles.streakGoalReward}>
											+{goal.reward} seeds
										</Text>
									</View>
								))}
							</View>
						</View>
					)}

					{manualTasks.length > 0 && (
						<View style={styles.card}>
							<Text style={styles.sectionTitle}>My Tasks</Text>
							{manualTasks.map(task => {
								const isExpanded = expandedTask === task.id;
								const isCompleted = task.status === "COMPLETED";
								return (
									<TouchableOpacity
										key={task.id}
										style={styles.taskCard}
										onPress={() => toggleTask(task.id)}
										activeOpacity={0.8}>
										<Text style={styles.assignmentTask}>
											{task.title}
										</Text>
										<Text style={styles.assignmentChild}>
											{task.points} seeds
										</Text>
										<Text
											style={[
												styles.childStatus,
												!isCompleted &&
													styles.pendingStatus,
											]}>
											{isCompleted
												? "Completed"
												: "Pending"}
										</Text>
										{isExpanded && (
											<View style={styles.expandArea}>
												<Text style={styles.lightText}>
													Tap button to{" "}
													{isCompleted
														? "undo"
														: "complete"}{" "}
													this task.
												</Text>
												<TouchableOpacity
													style={
														styles.childActionButton
													}
													onPress={event => {
														event.stopPropagation();
														completeMutation.mutate(
															{
																taskId: task.id,
																status: isCompleted
																	? "PENDING"
																	: "COMPLETED",
															}
														);
													}}>
													<Text
														style={
															styles.childActionText
														}>
														{isCompleted
															? "Undo"
															: "Mark Complete"}
													</Text>
												</TouchableOpacity>
											</View>
										)}
									</TouchableOpacity>
								);
							})}
						</View>
					)}

					{routineGroups.map(group => {
						const routineComplete = group.tasks.every(
							task => task.status === "COMPLETED"
						);
						return (
							<View
								key={group.id}
								style={styles.card}>
								<View style={styles.cardHeader}>
									<Text style={styles.sectionTitle}>
										{group.name}
									</Text>
									<View
										style={[
											styles.statusPill,
											routineComplete
												? styles.statusPillCompleted
												: styles.statusPillPending,
										]}>
										<Text style={styles.statusPillText}>
											{routineComplete
												? "Completed"
												: "In progress"}
										</Text>
									</View>
								</View>
								{group.tasks.map(task => {
									const isExpanded = expandedTask === task.id;
									const isCompleted =
										task.status === "COMPLETED";
									return (
										<TouchableOpacity
											key={task.id}
											style={styles.taskCard}
											onPress={() => toggleTask(task.id)}
											activeOpacity={0.8}>
											<Text style={styles.assignmentTask}>
												{task.title}
											</Text>
											<Text
												style={styles.assignmentChild}>
												{task.points} seeds
											</Text>
											<Text
												style={[
													styles.childStatus,
													!isCompleted &&
														styles.pendingStatus,
												]}>
												{isCompleted
													? "Completed"
													: "Pending"}
											</Text>
											{isExpanded && (
												<View style={styles.expandArea}>
													<Text
														style={
															styles.lightText
														}>
														Tap button to{" "}
														{isCompleted
															? "undo"
															: "complete"}{" "}
														this routine task.
													</Text>
													<TouchableOpacity
														style={
															styles.childActionButton
														}
														onPress={event => {
															event.stopPropagation();
															completeMutation.mutate(
																{
																	taskId: task.id,
																	status: isCompleted
																		? "PENDING"
																		: "COMPLETED",
																}
															);
														}}>
														<Text
															style={
																styles.childActionText
															}>
															{isCompleted
																? "Undo"
																: "Mark Complete"}
														</Text>
													</TouchableOpacity>
												</View>
											)}
										</TouchableOpacity>
									);
								})}
							</View>
						);
					})}
					<TouchableOpacity
						style={styles.ghostButton}
						onPress={() => router.push("/profile")}>
						<Text style={styles.ghostText}>Profile</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.textButton}
						onPress={() => router.push("/history")}>
						<Text style={styles.textButtonLabel}>Task history</Text>
					</TouchableOpacity>
				</ScrollView>
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: "#f8f5ff",
	},
	screen: {
		flex: 1,
	},
	container: {
		padding: 24,
		gap: 18,
	},
	greeting: {
		fontSize: 28,
		fontWeight: "700",
		color: "#1f2933",
	},
	subtitle: {
		color: "#6b7280",
		lineHeight: 20,
	},
	card: {
		backgroundColor: "#fff",
		borderRadius: 24,
		padding: 20,
		shadowColor: "#0f172a",
		shadowOpacity: 0.05,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 12 },
		gap: 8,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingBottom: 4,
	},
	cardHeaderTight: {
		paddingBottom: 0,
	},
	cardLabel: {
		color: "#94a3b8",
		textTransform: "uppercase",
		fontSize: 12,
		letterSpacing: 1.2,
	},
	cardValue: {
		fontSize: 20,
		fontWeight: "600",
		color: "#111827",
	},
	progressCard: {
		borderWidth: 1,
		borderColor: "#e0e7ff",
		backgroundColor: "#eef2ff",
		gap: 6,
	},
	seedDetail: {
		color: "#475569",
		fontWeight: "500",
	},
	sectionTitle: {
		fontWeight: "700",
		color: "#111827",
	},
	assignmentRow: {
		paddingVertical: 6,
		borderBottomWidth: 1,
		borderBottomColor: "#f1f5f9",
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
	},
	assignmentInfo: {
		flex: 1,
		gap: 2,
	},
	assignmentTask: {
		fontWeight: "600",
		color: "#1f2937",
	},
	assignmentChild: {
		color: "#6b7280",
	},
	privilegeItem: {
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#f1f5f9",
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	privilegeInfoStack: {
		flex: 1,
		gap: 2,
	},
	privilegeMeta: {
		color: "#475569",
		fontSize: 13,
	},
	childStatus: {
		color: "#16a34a",
		fontWeight: "600",
	},
	pendingStatus: {
		color: "#ea580c",
	},
	taskCard: {
		borderWidth: 1,
		borderColor: "#e0e7ff",
		borderRadius: 16,
		padding: 12,
		marginBottom: 10,
	},
	expandArea: {
		marginTop: 10,
		gap: 8,
	},
	childActionButton: {
		backgroundColor: "#6c63ff",
		paddingVertical: 10,
		borderRadius: 12,
		alignItems: "center",
	},
	childActionText: {
		color: "#fff",
		fontWeight: "600",
	},
	lightText: {
		color: "#94a3b8",
	},
	streakCard: {
		backgroundColor: "#fff",
		borderRadius: 20,
		padding: 18,
		gap: 12,
		shadowColor: "#0f172a",
		shadowOpacity: 0.04,
		shadowRadius: 12,
	},
	streakHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	streakValue: {
		color: "#4c1d95",
		fontWeight: "600",
	},
	streakBar: {
		height: 8,
		borderRadius: 999,
		backgroundColor: "#ede9fe",
		overflow: "hidden",
		position: "relative",
	},
	streakBarFill: {
		position: "absolute",
		top: 0,
		left: 0,
		bottom: 0,
		backgroundColor: "#7c3aed",
	},
	streakMarker: {
		position: "absolute",
		top: -4,
		transform: [{ translateX: -1 }],
		alignItems: "center",
	},
	streakMarkerDot: {
		width: 4,
		height: 16,
		borderRadius: 999,
		backgroundColor: "#a78bfa",
	},
	streakGoalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 8,
	},
	streakGoal: {
		alignItems: "flex-start",
		flex: 1,
	},
	streakGoalLabel: {
		color: "#475569",
		fontSize: 12,
		textTransform: "uppercase",
	},
	streakGoalReward: {
		color: "#1e1b4b",
		fontWeight: "600",
	},
	actions: {
		gap: 12,
	},
	primaryButton: {
		backgroundColor: "#6c63ff",
		paddingVertical: 14,
		borderRadius: 18,
		alignItems: "center",
	},
	buttonText: {
		color: "#fff",
		fontWeight: "600",
		fontSize: 16,
	},
	ghostButton: {
		paddingVertical: 12,
		borderRadius: 18,
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#d1d5db",
	},
	ghostText: {
		color: "#4b5563",
		fontWeight: "600",
	},
	linkButton: {
		marginTop: 10,
	},
	linkText: {
		color: "#6c63ff",
		fontWeight: "600",
	},
	statusPill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
	},
	statusPillPending: {
		backgroundColor: "#eef2ff",
	},
	statusPillCompleted: {
		backgroundColor: "#dcfce7",
	},
	statusPillText: {
		fontSize: 12,
		fontWeight: "600",
		color: "#312e81",
		textTransform: "capitalize",
	},
	avatarDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	textButton: {
		alignItems: "center",
		paddingVertical: 8,
	},
	textButtonLabel: {
		color: "#6c63ff",
		fontWeight: "600",
	},
	confettiContainer: {
		position: "absolute",
		top: 60,
		left: 0,
		right: 0,
		height: 220,
		zIndex: 5,
	},
	confettiPiece: {
		position: "absolute",
		width: 8,
		height: 16,
		borderRadius: 4,
	},
});
