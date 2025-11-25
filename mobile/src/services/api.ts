import { API_BASE_URL } from "../config/env";

type FetchOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

const CLIENT_TIMEZONE =
  typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : undefined;

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (CLIENT_TIMEZONE) {
    headers["X-Timezone"] = CLIENT_TIMEZONE;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = (data as { error?: string }).error ?? "Something went wrong";
    throw new Error(errorMessage);
  }

  return data as T;
}

export type UserSummary = {
  id: string;
  name: string;
  username: string;
  role: "PARENT" | "CHILD";
  email?: string | null;
  avatarTone?: string | null;
  familyId?: string | null;
  family?: {
    id: string;
    name: string;
    timezone?: string;
  } | null;
  progress?: {
    seedBalance: number;
    streak: number;
  };
};

export type LoginResponse = {
  token: string;
  user: UserSummary;
};

export type RegisterParentPayload = {
  familyName: string;
  parent: {
    name: string;
    username: string;
    email: string;
    password: string;
  };
};

export type RegisterParentResponse = {
  token: string;
  parent: UserSummary;
};

export type FamilyMember = {
  id: string;
  name: string;
  username: string;
  role: "PARENT" | "CHILD";
  email?: string | null;
  avatarTone?: string | null;
};

export async function login(identifier: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: { identifier, password },
  });
}

export async function registerParent(payload: RegisterParentPayload) {
  return request<RegisterParentResponse>("/auth/register-parent", {
    method: "POST",
    body: payload,
  });
}

export async function fetchProfile(token: string) {
  return request<UserSummary & { progress?: { seedBalance: number; streak: number } }>("/auth/me", {
    method: "GET",
    token,
  });
}

export async function updateProfile(
  token: string,
  payload: {
    name?: string;
    avatarTone?: string | null;
    currentPassword?: string;
    newPassword?: string;
    familyTimezone?: string;
  },
) {
  return request<UserSummary>("/auth/me", {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function fetchFamilyMembers(token: string) {
  return request<FamilyMember[]>("/auth/family/members", {
    method: "GET",
    token,
  });
}

type CreateChildPayload = {
  name: string;
  username: string;
  email?: string;
  password: string;
  avatarTone?: string;
};

export async function createChild(token: string, payload: CreateChildPayload) {
  return request<{ child: FamilyMember }>("/auth/add-child", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function inviteParent(
  token: string,
  payload: { name: string; username: string; email: string; password: string },
) {
  return request<{ parent: FamilyMember }>("/auth/family/parents", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateFamilyMember(
  token: string,
  userId: string,
  payload: { name?: string; username?: string; avatarTone?: string | null; newPassword?: string },
) {
  return request<FamilyMember>(`/auth/family/members/${userId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function deleteFamilyMember(token: string, userId: string) {
  return request(`/auth/family/members/${userId}`, {
    method: "DELETE",
    token,
  });
}

export type FamilyOverviewEntry = {
  id: string;
  name: string;
  username: string;
  role: "PARENT" | "CHILD";
  avatarTone?: string | null;
  email?: string | null;
  stats: Record<string, number>;
};

export async function fetchFamilyOverview(token: string) {
  return request<FamilyOverviewEntry[]>("/auth/family/overview", {
    method: "GET",
    token,
  });
}

export async function deleteFamilyAccount(token: string) {
  return request("/auth/family", {
    method: "DELETE",
    token,
  });
}

export type PrivilegeDefinition = {
  id: string;
  title: string;
  description?: string | null;
  cost: number;
  createdAt: string;
};

export type PrivilegeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "TERMINATED";

type PrivilegeRequestBase = {
  id: string;
  privilegeId: string;
  privilege: PrivilegeDefinition;
  childId?: string;
  status: PrivilegeRequestStatus;
  note?: string | null;
  cost: number;
  createdAt: string;
  resolvedAt?: string | null;
};

export type PrivilegeRequestEntry = PrivilegeRequestBase & {
  childName?: string;
  childAvatarTone?: string | null;
};

type PrivilegeRequestApiResponse = PrivilegeRequestBase & {
  child?: { id: string; name: string; avatarTone?: string | null } | null;
  childName?: string;
  childAvatarTone?: string | null;
};

const mapPrivilegeRequest = (entry: PrivilegeRequestApiResponse): PrivilegeRequestEntry => {
  const { child, childName, childAvatarTone, ...rest } = entry;
  return {
    ...rest,
    childName: childName ?? child?.name,
    childAvatarTone: childAvatarTone ?? child?.avatarTone,
  };
};

export type PointEntry = {
  id: string;
  type: "GIFT" | "PENALTY";
  points: number;
  amount: number;
  note?: string | null;
  createdAt: string;
  child?: {
    id: string;
    name: string;
    username?: string;
    avatarTone?: string | null;
  };
  createdBy?: {
    id: string;
    name: string;
  };
};

export async function fetchFamilyStreakSettings(token: string) {
  return request<{
    dailyStreakReward: number;
    weeklyStreakReward: number;
    monthlyStreakReward: number;
    yearlyStreakReward: number;
  }>("/auth/family/streaks", {
    method: "GET",
    token,
  });
}

export async function updateFamilyStreakSettings(
  token: string,
  payload: {
    dailyStreakReward: number;
    weeklyStreakReward: number;
    monthlyStreakReward: number;
    yearlyStreakReward: number;
  },
) {
  return request("/auth/family/streaks", {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function fetchPrivileges(token: string) {
  return request<PrivilegeDefinition[]>("/privileges", {
    method: "GET",
    token,
  });
}

export async function createPrivilege(
  token: string,
  payload: { title: string; description?: string; cost: number },
) {
  return request<PrivilegeDefinition>("/privileges", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updatePrivilege(
  token: string,
  privilegeId: string,
  payload: { title?: string; description?: string; cost?: number },
) {
  return request<PrivilegeDefinition>(`/privileges/${privilegeId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function deletePrivilege(token: string, privilegeId: string) {
  return request(`/privileges/${privilegeId}`, {
    method: "DELETE",
    token,
  });
}

export async function requestPrivilege(token: string, privilegeId: string) {
  const entry = await request<PrivilegeRequestApiResponse>(`/privileges/${privilegeId}/request`, {
    method: "POST",
    token,
  });
  return mapPrivilegeRequest(entry);
}

export async function fetchPrivilegeRequests(token: string) {
  const entries = await request<PrivilegeRequestApiResponse[]>("/privileges/requests", {
    method: "GET",
    token,
  });
  return entries.map(mapPrivilegeRequest);
}

export async function fetchMyPrivilegeRequests(token: string) {
  const entries = await request<PrivilegeRequestApiResponse[]>("/privileges/my-requests", {
    method: "GET",
    token,
  });
  return entries.map(mapPrivilegeRequest);
}

export async function decidePrivilegeRequest(
  token: string,
  requestId: string,
  payload: { status: "APPROVED" | "REJECTED"; note?: string },
) {
  const entry = await request<PrivilegeRequestApiResponse>(`/privileges/requests/${requestId}/decision`, {
    method: "POST",
    token,
    body: payload,
  });
  return mapPrivilegeRequest(entry);
}

export async function terminatePrivilegeRequest(token: string, requestId: string, payload: { note?: string } = {}) {
  const entry = await request<PrivilegeRequestApiResponse>(`/privileges/requests/${requestId}/terminate`, {
    method: "POST",
    token,
    body: payload,
  });
  return mapPrivilegeRequest(entry);
}

type PointQueryParams = {
  scope?: "today" | "recent";
  limit?: number;
  childId?: string;
};

export async function fetchPointEntries(token: string, params: PointQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.scope) {
    query.set("scope", params.scope);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  if (params.childId) {
    query.set("childId", params.childId);
  }

  const search = query.toString();
  return request<PointEntry[]>(`/points${search ? `?${search}` : ""}`, {
    method: "GET",
    token,
  });
}

export async function fetchPointHistory(token: string, params: { childId?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.childId) {
    query.set("childId", params.childId);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const search = query.toString();
  return request<PointEntry[]>(`/points/history${search ? `?${search}` : ""}`, {
    method: "GET",
    token,
  });
}

export async function createPointEntry(
  token: string,
  payload: { childId: string; type: "GIFT" | "PENALTY"; amount: number; note?: string },
) {
  return request<PointEntry>(`/points`, {
    method: "POST",
    token,
    body: payload,
  });
}

export type NudgeSetting = {
  id: string;
  childId: string;
  childName?: string | null;
  childAvatarTone?: string | null;
  type: string;
  label: string;
  time: string;
  message?: string | null;
  enabled: boolean;
  updatedAt: string;
};

export async function fetchNudges(token: string, params: { childId?: string } = {}) {
  const search = params.childId ? `?childId=${params.childId}` : "";
  return request<NudgeSetting[]>(`/nudges${search}`, {
    method: "GET",
    token,
  });
}

export async function updateNudges(
  token: string,
  payload: {
    childId: string;
    nudges: Array<{ type: string; time: string; enabled: boolean; message?: string | null }>;
  },
) {
  return request<NudgeSetting[]>(`/nudges`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export type ChildTaskSummary = {
  id: string;
  title: string;
  icon?: string | null;
  reminderStyle: string;
  points: number;
  frequency: string;
  status: string;
  routineName?: string | null;
  routineId?: string | null;
  daysOfWeek?: string[] | null;
};

export type ParentTaskSummary = {
  id: string;
  title: string;
  points: number;
  routineName?: string | null;
  assignments: Array<{
    childId: string;
    childName: string;
    childAvatarTone?: string | null;
    status: string;
  }>;
};

export async function fetchTasks(token: string) {
  return request<Array<ChildTaskSummary | ParentTaskSummary>>("/tasks", {
    method: "GET",
    token,
  });
}

export type TaskDetail = {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  points: number;
  reminderStyle: string;
  frequency: string;
  daysOfWeek?: string[];
  routineName?: string | null;
  assignments: Array<{
    childId: string;
    childName: string;
    childAvatarTone?: string | null;
    status: string;
  }>;
  completions: Array<{
    id: string;
    childId: string;
    childName: string;
    childAvatarTone?: string | null;
    status: string;
    date: string;
  }>;
};

export async function fetchTaskDetail(token: string, taskId: string) {
  return request<TaskDetail>(`/tasks/${taskId}`, {
    method: "GET",
    token,
  });
}

export type TaskHistoryEntry = {
  id: string;
  taskTitle: string;
  childName?: string;
  points?: number;
  childAvatarTone?: string | null;
  status: string;
  date: string;
};

export async function fetchTaskHistory(token: string, childId?: string) {
  const query = childId ? `?childId=${childId}` : "";
  return request<TaskHistoryEntry[]>(`/tasks/history${query}`, {
    method: "GET",
    token,
  });
}

export async function createTask(
  token: string,
  payload: {
    title: string;
    description?: string;
    icon?: string;
    reminderStyle?: string;
    frequency?: string;
    daysOfWeek?: string[];
    points?: number;
  },
) {
  return request("/tasks", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function assignTask(token: string, taskId: string, childId: string) {
  return request(`/tasks/${taskId}/assign`, {
    method: "POST",
    token,
    body: { childId },
  });
}

export async function completeTask(
  token: string,
  taskId: string,
  payload: { status?: string; childId?: string } = {},
) {
  return request(`/tasks/${taskId}/complete`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function unassignTask(token: string, taskId: string, childId: string) {
  return request(`/tasks/${taskId}/assign/${childId}`, {
    method: "DELETE",
    token,
  });
}

export async function deleteTask(token: string, taskId: string) {
  return request(`/tasks/${taskId}`, {
    method: "DELETE",
    token,
  });
}

export type RoutineTemplateItem = {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  points: number;
  reminderStyle: string;
};

export type RoutineTemplate = {
  id: string;
  name: string;
  description?: string | null;
  frequency: string;
  daysOfWeek?: string[] | null;
  rewardNote?: string | null;
  items: RoutineTemplateItem[];
  assignments?: Array<{
    id: string;
    childId: string;
    childName: string;
    childAvatarTone?: string | null;
  }>;
};

export async function fetchRoutineTemplates(token: string) {
  return request<RoutineTemplate[]>("/routines/templates", {
    method: "GET",
    token,
  });
}

export async function fetchRoutineTemplateDetail(token: string, templateId: string) {
  return request<RoutineTemplate>(`/routines/templates/${templateId}`, {
    method: "GET",
    token,
  });
}

export async function createRoutineTemplate(
  token: string,
  payload: {
    name: string;
    description?: string;
    frequency?: string;
    daysOfWeek?: string[];
    rewardNote?: string;
    items: Array<{
      title: string;
      description?: string;
      icon?: string;
      points?: number;
      reminderStyle?: string;
    }>;
  },
) {
  return request("/routines/templates", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function assignRoutineTemplate(token: string, templateId: string, childId: string) {
  return request(`/routines/templates/${templateId}/assign`, {
    method: "POST",
    token,
    body: { childId },
  });
}

export async function updateRoutineTemplate(
  token: string,
  templateId: string,
  payload: {
    name?: string;
    description?: string;
    rewardNote?: string;
    frequency?: string;
    daysOfWeek?: string[];
    items: Array<{
      title: string;
      description?: string;
      icon?: string;
      points?: number;
      reminderStyle?: string;
    }>;
  },
) {
  return request(`/routines/templates/${templateId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function deleteRoutineTemplate(token: string, templateId: string) {
  return request(`/routines/templates/${templateId}`, {
    method: "DELETE",
    token,
  });
}

export async function unassignRoutineTemplate(token: string, templateId: string, childId: string) {
  return request(`/routines/templates/${templateId}/assign/${childId}`, {
    method: "DELETE",
    token,
  });
}
