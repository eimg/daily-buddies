import { Router } from "express";
import { prisma, UserRole, CompletionStatus } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { childProgressSnapshot } from "../services/progress";
import { REMINDER_PROMPTS } from "../constants/templates";
import { startOfDayUTC } from "../utils/dates";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

router.get(
  "/parent",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not assigned" });
    }

    const start = startOfDayUTC();
    const end = new Date(start.getTime() + DAY_MS);

    const [tasks, completions, children, moods, rewards, missions, notes] =
      await Promise.all([
        prisma.task.findMany({
          where: { familyId: req.user.familyId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.taskCompletion.findMany({
          where: {
            task: { familyId: req.user.familyId },
            date: { gte: start, lt: end },
          },
          include: {
            child: { select: { id: true, name: true } },
          },
        }),
        prisma.user.findMany({
          where: { familyId: req.user.familyId, role: UserRole.CHILD },
          orderBy: { createdAt: "asc" },
        }),
        prisma.moodEntry.findMany({
          where: { user: { familyId: req.user.familyId, role: UserRole.CHILD } },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { user: { select: { id: true, name: true } } },
        }),
        prisma.rewardDefinition.findMany({
          where: { familyId: req.user.familyId },
          orderBy: { cost: "asc" },
        }),
        prisma.teamMission.findMany({
          where: { familyId: req.user.familyId, status: { not: "ARCHIVED" } },
          orderBy: { createdAt: "desc" },
          include: {
            participants: { include: { user: { select: { id: true, name: true } } } },
          },
        }),
        prisma.kindNote.findMany({
          where: {
            OR: [
              { fromUser: { familyId: req.user.familyId } },
              { toUser: { familyId: req.user.familyId } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            fromUser: { select: { id: true, name: true } },
            toUser: { select: { id: true, name: true } },
          },
        }),
      ]);

    const taskStatus = tasks.map((task) => {
      const entries = completions.filter((entry) => entry.taskId === task.id);
      return {
        id: task.id,
        title: task.title,
        completed: entries.filter((entry) => entry.status === CompletionStatus.COMPLETED).length,
        pending: entries.filter((entry) => entry.status === CompletionStatus.PENDING).length,
        skipped: entries.filter((entry) => entry.status === CompletionStatus.SKIPPED).length,
      };
    });

    const childrenProgress = await Promise.all(
      children.map(async (child) => ({
        child: {
          id: child.id,
          name: child.name,
          avatarTone: child.avatarTone,
        },
        progress: await childProgressSnapshot(child.id),
      })),
    );

    return res.json({
      tasks: taskStatus,
      children: childrenProgress,
      moods,
      rewards,
      missions,
      notes,
    });
  },
);

router.get(
  "/child",
  authMiddleware,
  requireRole(UserRole.CHILD),
  async (req: AuthenticatedRequest, res) => {
    const [tasks, progress, notes] = await Promise.all([
      prisma.task.findMany({
        where: {
          active: true,
          ...(req.user?.familyId ? { familyId: req.user.familyId } : {}),
        },
        orderBy: { createdAt: "asc" },
        include: {
          completions: {
            where: { childId: req.user!.id },
          orderBy: { date: "desc" },
          take: 1,
        },
      },
    }),
    childProgressSnapshot(req.user!.id),
    prisma.kindNote.findMany({
      where: { toUserId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { fromUser: { select: { id: true, name: true } } },
    }),
  ]);

  const reminder =
    REMINDER_PROMPTS[Math.floor(Math.random() * REMINDER_PROMPTS.length)] ??
    "Little steps grow big results.";

  return res.json({
    reminder,
    streak: progress.streak,
    seeds: progress.seedBalance,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      icon: task.icon,
      points: task.points,
      lastStatus: task.completions[0]?.status ?? CompletionStatus.PENDING,
    })),
    notes,
  });
});

router.get(
  "/parent/insights",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not assigned" });
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * DAY_MS);

    const [completions, moods] = await Promise.all([
      prisma.taskCompletion.findMany({
        where: {
          task: { familyId: req.user.familyId },
          date: { gte: fourteenDaysAgo },
        },
        include: {
          task: { select: { id: true, title: true } },
        },
      }),
      prisma.moodEntry.findMany({
        where: {
          user: { familyId: req.user.familyId, role: UserRole.CHILD },
          createdAt: { gte: fourteenDaysAgo },
        },
      }),
    ]);

    const hardshipMap = new Map<string, { title: string; skipped: number; completed: number }>();

    completions.forEach((completion) => {
      const entry =
        hardshipMap.get(completion.taskId) ??
        { title: completion.task.title, skipped: 0, completed: 0 };
      if (completion.status === CompletionStatus.SKIPPED) {
        entry.skipped += 1;
      }
      if (completion.status === CompletionStatus.COMPLETED) {
        entry.completed += 1;
      }
      hardshipMap.set(completion.taskId, entry);
    });

    const hardestTasks = Array.from(hardshipMap.values())
      .sort((a, b) => b.skipped - a.skipped)
      .slice(0, 3);

    const completionByWeekday = new Array(7).fill(0);
    completions.forEach((completion) => {
      if (completion.status === CompletionStatus.COMPLETED) {
        completionByWeekday[new Date(completion.date).getDay()] += 1;
      }
    });

    const bestDayIndex = completionByWeekday.indexOf(Math.max(...completionByWeekday));

    const moodCounts = moods.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] ?? 0) + 1;
      return acc;
    }, {});

    return res.json({
      hardestTasks,
      bestReminderHint:
        bestDayIndex >= 0
          ? `Most wins happen on ${DAY_NAMES[bestDayIndex]}s — aim reminders there.`
          : "Need a few more days of data for timing hints.",
      emotionalTrend: moodCounts,
    });
  },
);

export default router;
