import { prisma, CompletionStatus, StreakPeriod, PrivilegeRequestStatus } from "../prisma";
import { startOfDayInTimeZone, dayBoundsForTimeZone, weekdayKeyForTimeZone } from "../utils/dates";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type DayKey = (typeof WEEK_DAYS)[number];

const sanitizeDayInput = (value: unknown): DayKey | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().slice(0, 3).toUpperCase();
  return (WEEK_DAYS as readonly string[]).includes(normalized) ? (normalized as DayKey) : undefined;
};

const parseDays = (value?: unknown): DayKey[] | undefined => {
  if (!value || !Array.isArray(value)) {
    return undefined;
  }
  const parsed = value
    .map((entry) => sanitizeDayInput(entry))
    .filter((entry): entry is DayKey => Boolean(entry));
  return parsed.length > 0 ? parsed : undefined;
};

const isActiveOnDay = (value: unknown, dayKey: DayKey) => {
  const parsed = parseDays(value);
  if (!parsed || parsed.length === 0) {
    return true;
  }
  return parsed.includes(dayKey);
};

const isActiveOnKey = (value: unknown, dayKey: DayKey) => {
  const parsed = parseDays(value);
  if (!parsed || parsed.length === 0) {
    return true;
  }
  return parsed.includes(dayKey);
};

const isActiveToday = (value: unknown, timeZone: string) => {
  const todayKey = weekdayKeyForTimeZone(timeZone) as DayKey;
  return isActiveOnDay(value, todayKey);
};

export async function calculateSeedBalance(childId: string) {
  const [earned, missionBonus, spent, streakRewards, privilegeSpent, manualAdjustments] = await Promise.all([
    prisma.taskCompletion.aggregate({
      where: { childId },
      _sum: { seedsEarned: true },
    }),
    prisma.missionReward.aggregate({
      where: { userId: childId },
      _sum: { seedsEarned: true },
    }),
    prisma.rewardRedemption.aggregate({
      where: { childId },
      _sum: { seedsSpent: true },
    }),
    prisma.streakRewardLog.aggregate({
      where: { childId },
      _sum: { seedsEarned: true },
    }),
    prisma.privilegeRequest.aggregate({
      where: {
        childId,
        status: { in: [PrivilegeRequestStatus.APPROVED, PrivilegeRequestStatus.TERMINATED] },
      },
      _sum: { cost: true },
    }),
    prisma.pointAdjustment.aggregate({
      where: { childId },
      _sum: { points: true },
    }),
  ]);

  const earnedSeeds = earned._sum.seedsEarned ?? 0;
  const missionSeeds = missionBonus._sum.seedsEarned ?? 0;
  const spentSeeds = spent._sum.seedsSpent ?? 0;
  const streakSeeds = streakRewards._sum.seedsEarned ?? 0;
  const privilegeCost = privilegeSpent._sum.cost ?? 0;
  const adjustmentSeeds = manualAdjustments._sum.points ?? 0;

  return earnedSeeds + missionSeeds + streakSeeds + adjustmentSeeds - spentSeeds - privilegeCost;
}

export async function calculateChildStreak(childId: string, timeZone: string) {
  const completions = await prisma.taskCompletion.findMany({
    where: {
      childId,
      status: CompletionStatus.COMPLETED,
    },
    orderBy: { date: "desc" },
    take: 60,
  });

  const uniqueDays = Array.from(
    new Set(completions.map((completion) => startOfDayInTimeZone(timeZone, completion.date).getTime())),
  ).sort((a, b) => b - a);

  let streak = 0;
  let expectedDay = startOfDayInTimeZone(timeZone, new Date()).getTime();
  let streakStart: Date | null = null;

  for (const day of uniqueDays) {
    if (day === expectedDay) {
      streak += 1;
      streakStart = new Date(day);
      expectedDay -= DAY_MS;
      continue;
    }

    if (day === expectedDay - DAY_MS) {
      streak += 1;
      streakStart = new Date(day);
      expectedDay = day - DAY_MS;
      continue;
    }

    if (day > expectedDay) {
      continue;
    }

    break;
  }

  if (streak > 0 && !streakStart) {
    streakStart = startOfDayInTimeZone(timeZone, new Date());
  }

  return { count: streak, startDate: streakStart };
}

export async function childProgressSnapshot(childId: string, timeZone: string) {
  const { start, end } = dayBoundsForTimeZone(timeZone);

  const [seedBalance, streakInfo, todayCompletions] = await Promise.all([
    calculateSeedBalance(childId),
    calculateChildStreak(childId, timeZone),
    prisma.taskCompletion.findMany({
      where: { childId, date: { gte: start, lt: end } },
    }),
  ]);

  const completedToday = todayCompletions.filter(
    (entry) => entry.status === CompletionStatus.COMPLETED,
  ).length;

  return {
    seedBalance,
    streak: streakInfo.count,
    completedToday,
    totalLoggedToday: todayCompletions.length,
  };
}

const STREAK_CONFIG = [
  { period: StreakPeriod.WEEKLY, threshold: 7, field: "weeklyStreakReward" as const },
  { period: StreakPeriod.MONTHLY, threshold: 31, field: "monthlyStreakReward" as const },
  { period: StreakPeriod.YEARLY, threshold: 365, field: "yearlyStreakReward" as const },
] as const;

type StreakInfo = Awaited<ReturnType<typeof calculateChildStreak>>;

export async function maybeAwardStreakRewards(
  childId: string,
  familyId: string,
  timeZone: string,
  streakInfo?: StreakInfo,
) {
  const info = streakInfo ?? (await calculateChildStreak(childId, timeZone));
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      dailyStreakReward: true,
      weeklyStreakReward: true,
      monthlyStreakReward: true,
      yearlyStreakReward: true,
    },
  });

  if (!family) {
    return info;
  }

  await maybeAwardDailyReward(childId, familyId, timeZone, family.dailyStreakReward);

  if (!info.startDate || info.count === 0) {
    return info;
  }

  for (const config of STREAK_CONFIG) {
    const rewardAmount = family[config.field];
    if (!rewardAmount || rewardAmount <= 0) {
      continue;
    }

    if (info.count < config.threshold) {
      continue;
    }

    const lastAward = await prisma.streakRewardLog.findFirst({
      where: { childId, period: config.period },
      orderBy: { awardedAt: "desc" },
    });

    if (lastAward && lastAward.awardedAt >= info.startDate) {
      continue;
    }

    await prisma.streakRewardLog.create({
      data: {
        childId,
        familyId,
        period: config.period,
        streakValue: info.count,
        seedsEarned: rewardAmount,
      },
    });
  }

  return info;
}

async function maybeAwardDailyReward(
  childId: string,
  familyId: string,
  timeZone: string,
  rewardAmount?: number,
) {
  if (!rewardAmount || rewardAmount <= 0) {
    return;
  }
  const { start, end } = dayBoundsForTimeZone(timeZone);

  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      active: true,
      assignments: { some: { childId } },
    },
    select: {
      id: true,
      daysOfWeek: true,
    },
  });

  const tasksDueToday = tasks.filter((task) => isActiveToday(task.daysOfWeek, timeZone)).map((task) => task.id);
  if (tasksDueToday.length === 0) {
    return;
  }

  const completions = await prisma.taskCompletion.findMany({
    where: {
      childId,
      taskId: { in: tasksDueToday },
      date: { gte: start, lt: end },
      status: CompletionStatus.COMPLETED,
    },
    select: { taskId: true },
  });

  const uniqueCompleted = new Set(completions.map((completion) => completion.taskId));
  if (uniqueCompleted.size !== tasksDueToday.length) {
    return;
  }

  const lastDaily = await prisma.streakRewardLog.findFirst({
    where: { childId, period: StreakPeriod.DAILY },
    orderBy: { awardedAt: "desc" },
  });

  if (lastDaily && startOfDayInTimeZone(timeZone, lastDaily.awardedAt).getTime() === start.getTime()) {
    return;
  }

  await prisma.streakRewardLog.create({
    data: {
      childId,
      familyId,
      period: StreakPeriod.DAILY,
      streakValue: uniqueCompleted.size,
      seedsEarned: rewardAmount,
    },
  });
}

export async function maybeRevokeDailyReward(childId: string, familyId: string, timeZone: string) {
  const { start, end } = dayBoundsForTimeZone(timeZone);

  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      active: true,
      assignments: { some: { childId } },
    },
    select: {
      id: true,
      daysOfWeek: true,
    },
  });

  const tasksDueToday = tasks.filter((task) => isActiveToday(task.daysOfWeek, timeZone)).map((task) => task.id);
  if (tasksDueToday.length === 0) {
    return;
  }

  const completions = await prisma.taskCompletion.findMany({
    where: {
      childId,
      taskId: { in: tasksDueToday },
      date: { gte: start, lt: end },
      status: CompletionStatus.COMPLETED,
    },
    select: { taskId: true },
  });

  const uniqueCompleted = new Set(completions.map((completion) => completion.taskId));
  if (uniqueCompleted.size === tasksDueToday.length) {
    return;
  }

  await prisma.streakRewardLog.deleteMany({
    where: {
      childId,
      familyId,
      period: StreakPeriod.DAILY,
      awardedAt: {
        gte: start,
        lt: end,
      },
    },
  });
}
