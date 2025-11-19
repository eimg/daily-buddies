import { Router } from "express";
import { Prisma, prisma, UserRole, ReminderStyle, FrequencyType, CompletionStatus } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { startOfDayUTC } from "../utils/dates";
import { childProgressSnapshot, maybeAwardStreakRewards, maybeRevokeDailyReward } from "../services/progress";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type DayKey = (typeof WEEK_DAYS)[number];
const todayKey: DayKey = WEEK_DAYS[new Date().getUTCDay()] ?? "SUN";

const sanitizeDayInput = (value: unknown): DayKey | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().slice(0, 3).toUpperCase();
  return (WEEK_DAYS as readonly string[]).includes(normalized) ? (normalized as DayKey) : undefined;
};

const parseDays = (value?: Prisma.JsonValue | null): DayKey[] | undefined => {
  if (!value || !Array.isArray(value)) {
    return undefined;
  }
  const parsed = value
    .map((entry) => sanitizeDayInput(entry))
    .filter((entry): entry is DayKey => Boolean(entry));

  return parsed.length > 0 ? parsed : undefined;
};

const isActiveOnDay = (value: Prisma.JsonValue | null | undefined, dayKey?: DayKey) => {
  const parsed = parseDays(value);
  if (!parsed || parsed.length === 0) {
    return true;
  }
  if (!dayKey) {
    return true;
  }
  return parsed.includes(dayKey);
};

const isActiveToday = (value?: Prisma.JsonValue | null) => isActiveOnDay(value, todayKey);

const dayKeyFromDate = (date: Date): DayKey => WEEK_DAYS[date.getUTCDay()] ?? "SUN";

const normalizeDaysInput = (
  input?: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue => {
  if (!input || !Array.isArray(input)) {
    return Prisma.JsonNull;
  }

  const sanitized = input
    .map((entry) => sanitizeDayInput(entry))
    .filter((entry): entry is DayKey => Boolean(entry));

  return sanitized.length > 0 ? (sanitized as Prisma.JsonArray) : Prisma.JsonNull;
};

async function backfillMissedCompletions(childId: string) {
  const today = startOfDayUTC();

  const assignments = await prisma.taskAssignment.findMany({
    where: { childId },
    select: {
      taskId: true,
      assignedAt: true,
      task: { select: { daysOfWeek: true } },
    },
  });

  for (const assignment of assignments) {
    const lastCompletion = await prisma.taskCompletion.findFirst({
      where: {
        childId,
        taskId: assignment.taskId,
      },
      orderBy: { date: "desc" },
    });

    const lastDate = lastCompletion ? startOfDayUTC(new Date(lastCompletion.date)) : startOfDayUTC(new Date(assignment.assignedAt));
    let cursor = new Date(lastDate.getTime() + DAY_MS);

    while (cursor < today) {
      const dayKey = dayKeyFromDate(cursor);

      if (!isActiveOnDay(assignment.task?.daysOfWeek, dayKey)) {
        cursor = new Date(cursor.getTime() + DAY_MS);
        continue;
      }

      await prisma.taskCompletion.upsert({
        where: {
          taskId_childId_date: {
            taskId: assignment.taskId,
            childId,
            date: cursor,
          },
        },
        update: {},
        create: {
          taskId: assignment.taskId,
          childId,
          date: cursor,
          status: CompletionStatus.SKIPPED,
          seedsEarned: 0,
        },
      });
      cursor = new Date(cursor.getTime() + DAY_MS);
    }
  }
}

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const familyId = req.user?.familyId;
  if (!familyId) {
    return res.status(400).json({ error: "Family not linked yet" });
  }

  const start = startOfDayUTC();
  const end = new Date(start.getTime() + DAY_MS);
  const familyChildren =
    req.user?.role === UserRole.PARENT
      ? await prisma.user
          .findMany({
            where: { familyId, role: UserRole.CHILD },
            select: { id: true },
          })
      : [];

  if (req.user?.role === UserRole.CHILD) {
    await backfillMissedCompletions(req.user.id);
  } else if (req.user?.role === UserRole.PARENT) {
    await Promise.all(familyChildren.map((child) => backfillMissedCompletions(child.id)));
  }

  if (req.user?.role === UserRole.CHILD) {
    const tasks = await prisma.task.findMany({
      where: {
        familyId,
        active: true,
        assignments: {
          some: { childId: req.user!.id },
        },
      },
      include: {
        routineTemplate: { select: { id: true, name: true } },
        completions: {
          where: { childId: req.user!.id, date: { gte: start, lt: end } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const payload = tasks
      .filter((task) => isActiveToday(task.daysOfWeek))
      .map((task) => {
        const completion = task.completions[0];
        return {
          id: task.id,
          title: task.title,
          icon: task.icon,
          reminderStyle: task.reminderStyle,
          points: task.points,
          frequency: task.frequency,
          status: completion?.status ?? CompletionStatus.PENDING,
          routineName: task.routineTemplate?.name ?? null,
          routineId: task.routineTemplate?.id ?? null,
          daysOfWeek: parseDays(task.daysOfWeek),
        };
      });

    return res.json(payload);
  }

  const tasks = await prisma.task.findMany({
    where: { familyId },
    include: {
      assignments: {
        include: {
          child: { select: { id: true, name: true, avatarTone: true } },
        },
      },
      routineTemplate: { select: { id: true, name: true } },
      completions: {
        where: { date: { gte: start, lt: end } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const grouped = tasks.map((task) => {
    const completionMap = new Map(
      task.completions.map((completion) => [completion.childId, completion.status]),
    );

    return {
      id: task.id,
      title: task.title,
      points: task.points,
      routineName: task.routineTemplate?.name ?? null,
      daysOfWeek: parseDays(task.daysOfWeek),
      assignments: task.assignments.map((assignment) => ({
        childId: assignment.child.id,
        childName: assignment.child.name,
        childAvatarTone: assignment.child.avatarTone,
        status: completionMap.get(assignment.child.id) ?? CompletionStatus.PENDING,
      })),
    };
  });

  return res.json(grouped);
});

router.post(
  "/",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { title, description, icon, reminderStyle, frequency, daysOfWeek, points } = req.body as {
      title?: string;
      description?: string;
      icon?: string;
      reminderStyle?: ReminderStyle;
      frequency?: FrequencyType;
      daysOfWeek?: string[];
      points?: number;
    };

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const normalizedDays = normalizeDaysInput(daysOfWeek);

    const task = await prisma.task.create({
      data: {
        title,
        description,
        icon,
        reminderStyle: reminderStyle ?? ReminderStyle.FRIENDLY,
        frequency: frequency ?? FrequencyType.DAILY,
        daysOfWeek: normalizedDays,
        points: points ?? 1,
        familyId: req.user?.familyId!,
        createdById: req.user!.id,
      },
    });

    return res.status(201).json(task);
  },
);

router.patch(
  "/:taskId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ error: "Task id is required" });
    }
    const { title, description, icon, reminderStyle, frequency, daysOfWeek, points, active } =
      req.body as {
        title?: string;
        description?: string;
        icon?: string;
        reminderStyle?: ReminderStyle;
        frequency?: FrequencyType;
        daysOfWeek?: string[];
        points?: number;
        active?: boolean;
      };

    const existing = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existing || existing.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Task not found" });
    }

    const data: Prisma.TaskUpdateInput = {
      title,
      description,
      icon,
      reminderStyle,
      frequency,
      points,
      active,
    };

    if (typeof daysOfWeek !== "undefined") {
      data.daysOfWeek = normalizeDaysInput(daysOfWeek);
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
    });

    return res.json(updated);
  },
);

router.post("/:taskId/complete", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  if (!taskId) {
    return res.status(400).json({ error: "Task id is required" });
  }
  const { status, childId } = req.body as { status?: CompletionStatus; childId?: string };
  const normalizedStatus = status ?? CompletionStatus.COMPLETED;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignments: {
        select: { childId: true },
      },
    },
  });

  if (!task || task.familyId !== req.user?.familyId) {
    return res.status(404).json({ error: "Task not found" });
  }

  let targetChildId: string | undefined;

  if (req.user?.role === UserRole.CHILD) {
    const assigned = task.assignments.some((assignment) => assignment.childId === req.user!.id);
    if (!assigned) {
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
    targetChildId = req.user!.id;
  } else if (req.user?.role === UserRole.PARENT) {
    if (!childId) {
      return res.status(400).json({ error: "childId is required" });
    }
    const assigned = task.assignments.some((assignment) => assignment.childId === childId);
    if (!assigned) {
      return res.status(404).json({ error: "Child not assigned to this task" });
    }
    targetChildId = childId;
  } else {
    return res.status(403).json({ error: "Unsupported role" });
  }

  const today = startOfDayUTC();
  const seedsEarned = normalizedStatus === CompletionStatus.COMPLETED ? task.points ?? 1 : 0;

    const completion = await prisma.taskCompletion.upsert({
      where: {
        taskId_childId_date: {
          taskId,
          childId: targetChildId,
        date: today,
      },
    },
    update: {
      status: normalizedStatus,
      seedsEarned,
    },
    create: {
      taskId,
      childId: targetChildId,
      status: normalizedStatus,
      date: today,
      seedsEarned,
    },
  });

    if (normalizedStatus === CompletionStatus.COMPLETED) {
      await maybeAwardStreakRewards(targetChildId, task.familyId);
    } else if (normalizedStatus === CompletionStatus.PENDING) {
      await maybeRevokeDailyReward(targetChildId, task.familyId);
    }

    const progress = await childProgressSnapshot(targetChildId);

  return res.json({
    completion,
    progress: {
      seedBalance: progress.seedBalance,
      streak: progress.streak,
    },
  });
});

router.post(
  "/:taskId/assign",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { taskId } = req.params;
    const { childId } = req.body as { childId?: string };

    if (!taskId || !childId) {
      return res.status(400).json({ error: "taskId and childId are required" });
    }

    const [task, child] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId } }),
      prisma.user.findUnique({ where: { id: childId } }),
    ]);

    if (!task || task.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (!child || child.familyId !== req.user?.familyId || child.role !== UserRole.CHILD) {
      return res.status(404).json({ error: "Child not found" });
    }

    const assignment = await prisma.taskAssignment.upsert({
      where: {
        taskId_childId: {
          taskId,
          childId,
        },
      },
      update: {},
      create: {
        taskId,
        childId,
      },
      include: {
        child: { select: { id: true, name: true } },
        task: { select: { title: true } },
      },
    });

    return res.status(201).json(assignment);
  },
);

router.delete(
  "/:taskId/assign/:childId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { taskId, childId } = req.params;

    if (!taskId || !childId) {
      return res.status(400).json({ error: "taskId and childId are required" });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { familyId: true },
    });

    if (!task || task.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Task not found" });
    }

    const assignment = await prisma.taskAssignment.findUnique({
      where: {
        taskId_childId: {
          taskId,
          childId,
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    await prisma.$transaction([
      prisma.taskCompletion.deleteMany({
        where: { taskId, childId },
      }),
      prisma.taskAssignment.delete({
        where: {
          taskId_childId: {
            taskId,
            childId,
          },
        },
      }),
    ]);

    return res.json({ success: true });
  },
);

router.delete(
  "/:taskId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ error: "Task id is required" });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { familyId: true },
    });

    if (!task || task.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Task not found" });
    }

    await prisma.$transaction([
      prisma.taskCompletion.deleteMany({ where: { taskId } }),
      prisma.taskAssignment.deleteMany({ where: { taskId } }),
      prisma.task.delete({ where: { id: taskId } }),
    ]);

    return res.json({ success: true });
  },
);

router.get(
  "/history",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const familyId = req.user?.familyId;
    if (!familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    if (req.user?.role === UserRole.CHILD) {
      await backfillMissedCompletions(req.user.id);

      const completions = await prisma.taskCompletion.findMany({
        where: {
          childId: req.user.id,
        },
        orderBy: { date: "desc" },
        take: 50,
        include: {
          task: { select: { title: true, points: true } },
        },
      });

      return res.json(
        completions.map((completion) => ({
          id: completion.id,
          taskTitle: completion.task.title,
          points: completion.seedsEarned,
          status: completion.status,
          date: completion.date,
        })),
      );
    }

    const { childId } = req.query as { childId?: string };
    const childFilter = childId || undefined;

    const childrenToBackfill = childFilter
      ? [{ id: childFilter }]
      : await prisma.user.findMany({
          where: { familyId, role: UserRole.CHILD },
          select: { id: true },
        });

    await Promise.all(childrenToBackfill.map((child) => backfillMissedCompletions(child.id)));

    const completions = await prisma.taskCompletion.findMany({
      where: {
        task: { familyId },
        childId: childFilter,
      },
      orderBy: { date: "desc" },
      take: 50,
      include: {
        task: { select: { title: true } },
        child: { select: { id: true, name: true, avatarTone: true } },
      },
    });

    return res.json(
      completions.map((completion) => ({
        id: completion.id,
        taskTitle: completion.task.title,
        childId: completion.child.id,
        childName: completion.child.name,
        childAvatarTone: completion.child.avatarTone,
        status: completion.status,
        date: completion.date,
      })),
    );
  },
);

router.get(
  "/:taskId",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ error: "Task id is required" });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        routineTemplate: { select: { id: true, name: true } },
        assignments: {
          include: {
            child: { select: { id: true, name: true, avatarTone: true } },
          },
        },
        completions: {
          orderBy: { date: "desc" },
          take: 20,
          include: {
            child: { select: { id: true, name: true, avatarTone: true } },
          },
        },
      },
    });

    if (!task || task.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (req.user?.role === UserRole.CHILD) {
      const assigned = task.assignments.some((assignment) => assignment.childId === req.user!.id);
      if (!assigned) {
        return res.status(403).json({ error: "You are not assigned to this task" });
      }
    }

    const todayStart = startOfDayUTC();
    const todayStatusMap = new Map<string, CompletionStatus>();
    for (const completion of task.completions) {
      const completionDay = startOfDayUTC(new Date(completion.date));
      if (completionDay.getTime() === todayStart.getTime()) {
        todayStatusMap.set(completion.childId, completion.status);
      }
    }

    return res.json({
      id: task.id,
      title: task.title,
      description: task.description,
      icon: task.icon,
      points: task.points,
      reminderStyle: task.reminderStyle,
      frequency: task.frequency,
      daysOfWeek: parseDays(task.daysOfWeek) ?? [],
      routineName: task.routineTemplate?.name ?? null,
      assignments: task.assignments.map((assignment) => ({
        childId: assignment.child.id,
        childName: assignment.child.name,
        childAvatarTone: assignment.child.avatarTone,
        status: todayStatusMap.get(assignment.child.id) ?? CompletionStatus.PENDING,
      })),
      completions: task.completions.map((completion) => ({
        id: completion.id,
        childId: completion.child.id,
        childName: completion.child.name,
        childAvatarTone: completion.child.avatarTone,
        status: completion.status,
        date: completion.date,
      })),
    });
  },
);

export default router;
