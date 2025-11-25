import { Router } from "express";
import {
  prisma,
  UserRole,
  Prisma,
  ReminderStyle,
  FrequencyType,
  CompletionStatus,
} from "../prisma";
import { hashPassword, verifyPassword, createToken } from "../services/security";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { childProgressSnapshot } from "../services/progress";
import { startOfDayUTC, dayBoundsForTimeZone } from "../utils/dates";

const router = Router();

type StarterTemplate = {
  name: string;
  description?: string;
  frequency?: FrequencyType;
  rewardNote?: string;
  daysOfWeek?: string[];
  items: Array<{
    title: string;
    description?: string;
    icon?: string;
    points?: number;
    reminderStyle?: ReminderStyle;
  }>;
};

type StarterTask = {
  title: string;
  description?: string;
  icon?: string;
  points?: number;
  reminderStyle?: ReminderStyle;
  frequency?: FrequencyType;
};

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "Morning Routine",
    description: "Start weekdays with focus.",
    frequency: FrequencyType.DAILY,
    rewardNote: "Complete all for +3 seeds",
    daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
    items: [
      { title: "Brush Teeth", icon: "🦷", points: 1 },
      { title: "Tidy Bed", icon: "🛏️", points: 1 },
      { title: "Change School Clothes", icon: "👕", points: 1 },
      { title: "Prepare School Bag", icon: "🎒", points: 2 },
    ],
  },
  {
    name: "After School Routine",
    description: "Wind down after classes.",
    frequency: FrequencyType.DAILY,
    daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
    items: [
      { title: "Change Clothes", icon: "👚", points: 1 },
      { title: "Shower Time", icon: "🚿", points: 2 },
      { title: "Do Homework", icon: "📘", points: 3 },
    ],
  },
  {
    name: "Weekend Routine",
    description: "Slow weekend rhythm.",
    frequency: FrequencyType.DAILY,
    daysOfWeek: ["SAT", "SUN"],
    items: [
      { title: "Tidy Room", icon: "🧹", points: 2 },
      { title: "Read a Book", icon: "📖", points: 2 },
    ],
  },
];

const STARTER_TASKS: StarterTask[] = [
  {
    title: "Feed Sprout the Cat",
    description: "Fresh water + crunchy bites",
    points: 3,
    icon: "🐾",
    reminderStyle: ReminderStyle.FRIENDLY,
    frequency: FrequencyType.DAILY,
  },
  {
    title: "15 min Reading",
    description: "Choose any cozy book",
    points: 2,
    icon: "📖",
    reminderStyle: ReminderStyle.FRIENDLY,
  },
];

const sanitizeUsername = (value: string) => value.trim().toLowerCase();
const sanitizeIdentifier = (value: string) => value.trim().toLowerCase();
const sanitizeEmail = (value?: string | null) => (value ? value.trim().toLowerCase() : null);
const isValidTimeZone = (value?: string | null) => {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

async function seedStarterContent(
  tx: Prisma.TransactionClient,
  familyId: string,
  parentId: string,
) {
  for (const template of STARTER_TEMPLATES) {
    await tx.routineTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        frequency: template.frequency ?? FrequencyType.DAILY,
        rewardNote: template.rewardNote,
        daysOfWeek: template.daysOfWeek ?? Prisma.JsonNull,
        familyId,
        createdById: parentId,
        items: {
          create: template.items.map((item) => ({
            title: item.title,
            description: item.description,
            icon: item.icon,
            points: item.points ?? 1,
            reminderStyle: item.reminderStyle ?? ReminderStyle.FRIENDLY,
          })),
        },
      },
    });
  }

  for (const task of STARTER_TASKS) {
    await tx.task.create({
      data: {
        title: task.title,
        description: task.description,
        icon: task.icon,
        points: task.points ?? 1,
        reminderStyle: task.reminderStyle ?? ReminderStyle.FRIENDLY,
        frequency: task.frequency ?? FrequencyType.DAILY,
        familyId,
        createdById: parentId,
      },
    });
  }
}

router.post("/register-parent", async (req, res) => {
  const { familyName, parent } = req.body as {
    familyName?: string;
    parent?: { name?: string; email?: string; username?: string; password?: string };
  };
  const headerTimezone =
    typeof req.headers["x-timezone"] === "string" && isValidTimeZone(req.headers["x-timezone"])
      ? (req.headers["x-timezone"] as string)
      : null;

  if (!familyName || !parent) {
    return res
      .status(400)
      .json({ error: "familyName, name, username, email, and password are required" });
  }

  const normalizedEmail = sanitizeEmail(parent.email);
  const normalizedUsername = parent.username ? sanitizeUsername(parent.username) : null;
  const { name, password } = parent;

  if (!name || !password || !normalizedEmail || !normalizedUsername) {
    return res.status(400).json({ error: "familyName, name, username, email, and password are required" });
  }

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail } }),
    prisma.user.findUnique({ where: { username: normalizedUsername } }),
  ]);

  if (existingEmail) {
    return res.status(409).json({ error: "Email already registered" });
  }

  if (existingUsername) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const passwordHash = await hashPassword(password);
  const familyTimezone = headerTimezone || "UTC";

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const family = await tx.family.create({
      data: { name: familyName, timezone: familyTimezone },
    });

    const createdParent = await tx.user.create({
      data: {
        name,
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        role: UserRole.PARENT,
        familyId: family.id,
      },
      include: {
        family: true,
      },
    });

    await seedStarterContent(tx, family.id, createdParent.id);

    return { family, createdParent };
  });

  const token = createToken({
    userId: result.createdParent.id,
    role: result.createdParent.role,
    familyId: result.family.id,
  });

  return res.status(201).json({
    token,
    parent: {
      id: result.createdParent.id,
      name: result.createdParent.name,
      email: result.createdParent.email,
      username: result.createdParent.username,
      role: result.createdParent.role,
      avatarTone: result.createdParent.avatarTone,
      familyId: result.createdParent.familyId,
    },
    family: result.family,
  });
});

router.post("/login", async (req, res) => {
  const { identifier, password, email } = req.body as { identifier?: string; email?: string; password?: string };
  const loginValue = identifier ?? email;

  if (!loginValue || !password) {
    return res.status(400).json({ error: "identifier and password are required" });
  }

  const normalized = sanitizeIdentifier(loginValue);
  const conditions: Prisma.UserWhereInput[] = [
    { username: normalized },
    { email: normalized },
  ];

  const user = await prisma.user.findFirst({
    where: {
      OR: conditions,
    },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = createToken({
    userId: user.id,
    role: user.role,
    familyId: user.familyId,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      familyId: user.familyId,
      avatarTone: user.avatarTone,
    },
  });
});

router.post(
  "/add-child",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { name, username, email, password, avatarTone } = req.body as {
      name?: string;
      username?: string;
      email?: string;
      password?: string;
      avatarTone?: string;
    };

    if (!name || !username || !password) {
      return res.status(400).json({ error: "name, username, and password are required" });
    }

    const familyId = req.user?.familyId;
    if (!familyId) {
      return res.status(400).json({ error: "Parent is not linked to a family yet" });
    }

    const normalizedUsername = sanitizeUsername(username);
    const normalizedEmail = sanitizeEmail(email);

    const [emailMatch, usernameMatch] = await Promise.all([
      normalizedEmail ? prisma.user.findUnique({ where: { email: normalizedEmail } }) : null,
      prisma.user.findUnique({ where: { username: normalizedUsername } }),
    ]);

    if (emailMatch) {
      return res.status(409).json({ error: "Email already registered" });
    }

    if (usernameMatch) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await hashPassword(password);

    const child = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        avatarTone,
        role: UserRole.CHILD,
        familyId,
        parentId: req.user?.id ?? null,
      },
    });

    return res.status(201).json({ child });
  },
);

router.get("/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const userRecord = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      family: true,
      parent: true,
    },
  });

  if (!userRecord) {
    return res.status(404).json({ error: "User not found" });
  }

  const profile: Record<string, unknown> = {
    id: userRecord.id,
    name: userRecord.name,
    role: userRecord.role,
    avatarTone: userRecord.avatarTone,
    email: userRecord.email,
    username: userRecord.username,
    familyId: userRecord.familyId,
    family: userRecord.family,
    parent: userRecord.parent ? { id: userRecord.parent.id, name: userRecord.parent.name } : null,
  };

  if (userRecord.role === UserRole.CHILD) {
    profile.progress = await childProgressSnapshot(
      userRecord.id,
      req.user?.familyTimezone ?? "UTC",
    );
  }

  return res.json(profile);
});

router.patch("/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { name, avatarTone, currentPassword, newPassword, familyTimezone } = req.body as {
    name?: string;
    avatarTone?: string | null;
    currentPassword?: string;
    newPassword?: string;
    familyTimezone?: string;
  };

  if (!name && typeof avatarTone === "undefined" && !newPassword && !familyTimezone) {
    return res.status(400).json({ error: "No updates provided" });
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: req.user!.id },
  });

  if (!userRecord) {
    return res.status(404).json({ error: "User not found" });
  }

  const data: Prisma.UserUpdateInput = {};

  if (typeof name === "string") {
    data.name = name;
  }

  if (typeof avatarTone !== "undefined") {
    data.avatarTone = avatarTone;
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Current password required to change password" });
    }

    const valid = await verifyPassword(currentPassword, userRecord.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    data.passwordHash = await hashPassword(newPassword);
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      avatarTone: true,
    },
  });

  if (familyTimezone) {
    if (req.user?.role !== UserRole.PARENT) {
      return res.status(403).json({ error: "Only parents can change family timezone" });
    }
    if (!isValidTimeZone(familyTimezone)) {
      return res.status(400).json({ error: "Invalid timezone" });
    }
    await prisma.family.update({
      where: { id: userRecord.familyId! },
      data: { timezone: familyTimezone },
    });
  }

  return res.json(updated);
});

router.get(
  "/family/children",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const filters = req.user?.familyId ? { familyId: req.user.familyId } : {};

    const children = await prisma.user.findMany({
      where: {
        ...filters,
        role: UserRole.CHILD,
      },
      select: {
        id: true,
        name: true,
        username: true,
        avatarTone: true,
        email: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return res.json(children);
  },
);

router.get(
  "/family/members",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const members = await prisma.user.findMany({
      where: { familyId: req.user.familyId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        avatarTone: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return res.json(members);
  },
);

router.get("/family/streaks", authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user?.familyId) {
    return res.status(400).json({ error: "Family not linked yet" });
  }

  const family = await prisma.family.findUnique({
    where: { id: req.user.familyId },
    select: {
      dailyStreakReward: true,
      weeklyStreakReward: true,
      monthlyStreakReward: true,
      yearlyStreakReward: true,
    },
  });

  return res.json(family);
});

router.patch(
  "/family/streaks",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const { dailyStreakReward, weeklyStreakReward, monthlyStreakReward, yearlyStreakReward } = req.body as {
      dailyStreakReward?: number;
      weeklyStreakReward?: number;
      monthlyStreakReward?: number;
      yearlyStreakReward?: number;
    };

    const data: Prisma.FamilyUpdateInput = {};

    if (typeof dailyStreakReward === "number") {
      data.dailyStreakReward = Math.max(0, dailyStreakReward);
    }
    if (typeof weeklyStreakReward === "number") {
      data.weeklyStreakReward = Math.max(0, weeklyStreakReward);
    }
    if (typeof monthlyStreakReward === "number") {
      data.monthlyStreakReward = Math.max(0, monthlyStreakReward);
    }
    if (typeof yearlyStreakReward === "number") {
      data.yearlyStreakReward = Math.max(0, yearlyStreakReward);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const updated = await prisma.family.update({
      where: { id: req.user.familyId },
      data,
      select: {
        dailyStreakReward: true,
        weeklyStreakReward: true,
        monthlyStreakReward: true,
        yearlyStreakReward: true,
      },
    });

    return res.json(updated);
  },
);

router.get(
  "/family/overview",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const familyId = req.user?.familyId;
    if (!familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const members = await prisma.user.findMany({
      where: { familyId },
      select: {
        id: true,
        name: true,
        role: true,
        avatarTone: true,
        username: true,
        email: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const childIds = members.filter((member) => member.role === UserRole.CHILD).map((m) => m.id);
    const parentIds = members.filter((member) => member.role === UserRole.PARENT).map((m) => m.id);

    const startOfDay = startOfDayUTC();
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const [assignmentCounts, completedToday, parentTaskCounts] = await Promise.all([
      childIds.length
        ? prisma.taskAssignment.groupBy({
            by: ["childId"],
            _count: { childId: true },
            where: { childId: { in: childIds } },
          })
        : [],
      childIds.length
        ? prisma.taskCompletion.groupBy({
            by: ["childId"],
            _count: { childId: true },
            where: {
              childId: { in: childIds },
              status: CompletionStatus.COMPLETED,
              date: {
                gte: startOfDay,
                lt: endOfDay,
              },
            },
          })
        : [],
      parentIds.length
        ? prisma.task.groupBy({
            by: ["createdById"],
            _count: { createdById: true },
            where: { createdById: { in: parentIds } },
          })
        : [],
    ]);

    const assignmentMap = new Map(assignmentCounts.map((entry) => [entry.childId, entry._count.childId]));
    const completedMap = new Map(completedToday.map((entry) => [entry.childId, entry._count.childId]));
    const parentTaskMap = new Map(parentTaskCounts.map((entry) => [entry.createdById, entry._count.createdById]));

    const overview = await Promise.all(
      members.map(async (member) => {
        if (member.role === UserRole.CHILD) {
          const progress = await childProgressSnapshot(member.id, req.user?.familyTimezone ?? "UTC");
          return {
            ...member,
            stats: {
              seedBalance: progress.seedBalance,
              streak: progress.streak,
              assignments: assignmentMap.get(member.id) ?? 0,
              completedToday: completedMap.get(member.id) ?? 0,
            },
          };
        }

        return {
          ...member,
          stats: {
            tasksCreated: parentTaskMap.get(member.id) ?? 0,
            kidsAssigned: childIds.length,
          },
        };
      }),
    );

    return res.json(overview);
  },
);

router.post(
  "/family/parents",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { name, email, username, password } = req.body as {
      name?: string;
      email?: string;
      username?: string;
      password?: string;
    };

    const normalizedEmail = sanitizeEmail(email);
    const normalizedUsername = username ? sanitizeUsername(username) : null;

    if (!name || !normalizedEmail || !normalizedUsername || !password) {
      return res.status(400).json({ error: "name, username, email, and password are required" });
    }

    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalizedEmail } }),
      prisma.user.findUnique({ where: { username: normalizedUsername } }),
    ]);

    if (existingEmail) {
      return res.status(409).json({ error: "Email already registered" });
    }

    if (existingUsername) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await hashPassword(password);

    const parent = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        role: UserRole.PARENT,
        familyId: req.user.familyId,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
      },
    });

    return res.status(201).json({ parent });
  },
);

router.patch(
  "/family/members/:userId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { userId } = req.params;
    const { name, username, avatarTone, newPassword } = req.body as {
      name?: string;
      username?: string;
      avatarTone?: string | null;
      newPassword?: string;
    };

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.familyId !== req.user.familyId) {
      return res.status(404).json({ error: "Family member not found" });
    }

    const data: Prisma.UserUpdateInput = {};
    if (typeof name === "string") {
      data.name = name;
    }

    if (typeof avatarTone !== "undefined") {
      data.avatarTone = avatarTone;
    }

    if (typeof username === "string" && username.trim()) {
      const normalizedUsername = sanitizeUsername(username);
      if (normalizedUsername !== target.username) {
        const usernameMatch = await prisma.user.findUnique({ where: { username: normalizedUsername } });
        if (usernameMatch) {
          return res.status(409).json({ error: "Username already taken" });
        }
        data.username = normalizedUsername;
      }
    }

    if (newPassword) {
      data.passwordHash = await hashPassword(newPassword);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        avatarTone: true,
      },
    });

    return res.json(updated);
  },
);

router.delete(
  "/family/members/:userId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.familyId !== req.user.familyId) {
      return res.status(404).json({ error: "Family member not found" });
    }

    const isPrimary = target.role === UserRole.PARENT && target.id === req.user.id;
    if (isPrimary) {
      return res.status(400).json({ error: "Primary account cannot be removed" });
    }

    await prisma.$transaction(async (tx) => {
      if (target.role === UserRole.CHILD) {
        await tx.taskCompletion.deleteMany({ where: { childId: userId } });
        await tx.taskAssignment.deleteMany({ where: { childId: userId } });
        await tx.routineAssignment.deleteMany({ where: { childId: userId } });
        await tx.rewardRedemption.deleteMany({ where: { childId: userId } });
        await tx.missionReward.deleteMany({ where: { userId } });
        await tx.teamParticipant.deleteMany({ where: { userId } });
        await tx.streakRewardLog.deleteMany({ where: { childId: userId } });
      }

      await tx.user.delete({ where: { id: userId } });
    });

    return res.json({ success: true });
  },
);

router.delete(
  "/family",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const familyId = req.user.familyId;

    await prisma.$transaction(async (tx) => {
      await tx.taskCompletion.deleteMany({ where: { task: { familyId } } });
      await tx.taskAssignment.deleteMany({ where: { task: { familyId } } });
      await tx.task.deleteMany({ where: { familyId } });
      await tx.routineAssignment.deleteMany({ where: { template: { familyId } } });
      await tx.routineTemplateItem.deleteMany({ where: { template: { familyId } } });
      await tx.routineTemplate.deleteMany({ where: { familyId } });
      await tx.rewardRedemption.deleteMany({ where: { child: { familyId } } });
      await tx.rewardDefinition.deleteMany({ where: { familyId } });
      await tx.kindNote.deleteMany({ where: { fromUser: { familyId } } });
      await tx.moodEntry.deleteMany({ where: { user: { familyId } } });
      await tx.teamParticipant.deleteMany({ where: { mission: { familyId } } });
      await tx.missionReward.deleteMany({ where: { mission: { familyId } } });
      await tx.teamMission.deleteMany({ where: { familyId } });
      await tx.streakRewardLog.deleteMany({ where: { familyId } });
      await tx.user.deleteMany({ where: { familyId } });
      await tx.family.delete({ where: { id: familyId } });
    });

    return res.json({ success: true });
  },
);

export default router;
