import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  calculateSeedBalance,
  calculateChildStreak,
  childProgressSnapshot,
} from "../src/services/progress";
import { CompletionStatus } from "../src/prisma";

const prismaMock = vi.hoisted(() => ({
  taskCompletion: {
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
  missionReward: {
    aggregate: vi.fn(),
  },
  rewardRedemption: {
    aggregate: vi.fn(),
  },
  streakRewardLog: {
    aggregate: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  privilegeRequest: {
    aggregate: vi.fn(),
  },
}));

vi.mock("../src/prisma", async () => {
  const actual = await vi.importActual<typeof import("../src/prisma")>("../src/prisma");
  return {
    ...actual,
    prisma: prismaMock,
  };
});

const resetMocks = () => {
  prismaMock.taskCompletion.aggregate.mockReset();
  prismaMock.taskCompletion.findMany.mockReset();
  prismaMock.missionReward.aggregate.mockReset();
  prismaMock.rewardRedemption.aggregate.mockReset();
  prismaMock.streakRewardLog.aggregate.mockReset();
  prismaMock.streakRewardLog.findFirst.mockReset();
  prismaMock.streakRewardLog.create.mockReset();
  prismaMock.privilegeRequest.aggregate.mockReset();
};

describe("progress service helpers", () => {
  beforeEach(() => {
    resetMocks();
    prismaMock.privilegeRequest.aggregate.mockResolvedValue({ _sum: { cost: 0 } });
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates seed balance with mission bonuses", async () => {
    prismaMock.taskCompletion.aggregate.mockResolvedValue({ _sum: { seedsEarned: 8 } });
    prismaMock.missionReward.aggregate.mockResolvedValue({ _sum: { seedsEarned: 4 } });
    prismaMock.rewardRedemption.aggregate.mockResolvedValue({ _sum: { seedsSpent: 5 } });
    prismaMock.streakRewardLog.aggregate.mockResolvedValue({ _sum: { seedsEarned: 2 } });
    prismaMock.privilegeRequest.aggregate.mockResolvedValue({ _sum: { cost: 3 } });

    const balance = await calculateSeedBalance("child-123");

    expect(balance).toBe(6);
    expect(prismaMock.taskCompletion.aggregate).toHaveBeenCalledWith({
      where: { childId: "child-123" },
      _sum: { seedsEarned: true },
    });
  });

  it("tracks streak across consecutive days", async () => {
    vi.useFakeTimers();
    const now = new Date("2024-11-14T08:00:00Z");
    vi.setSystemTime(now);

    prismaMock.taskCompletion.findMany.mockResolvedValue([
      { id: "1", childId: "child-1", date: now, status: CompletionStatus.COMPLETED },
      {
        id: "2",
        childId: "child-1",
        date: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        status: CompletionStatus.COMPLETED,
      },
      {
        id: "3",
        childId: "child-1",
        date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
        status: CompletionStatus.COMPLETED,
      },
    ]);

    const streak = await calculateChildStreak("child-1");
    vi.useRealTimers();

    expect(streak.count).toBe(2);
    expect(streak.startDate).toEqual(new Date("2024-11-13T00:00:00.000Z"));
    expect(prismaMock.taskCompletion.findMany).toHaveBeenCalled();
  });

  it("summarises daily progress snapshot", async () => {
    prismaMock.taskCompletion.aggregate.mockResolvedValue({ _sum: { seedsEarned: 5 } });
    prismaMock.missionReward.aggregate.mockResolvedValue({ _sum: { seedsEarned: 0 } });
    prismaMock.rewardRedemption.aggregate.mockResolvedValue({ _sum: { seedsSpent: 1 } });
    prismaMock.streakRewardLog.aggregate.mockResolvedValue({ _sum: { seedsEarned: 0 } });

    prismaMock.taskCompletion.findMany.mockResolvedValue([
      { id: "a", childId: "child-77", date: new Date(), status: CompletionStatus.COMPLETED },
      { id: "b", childId: "child-77", date: new Date(), status: CompletionStatus.PENDING },
    ]);

    const snapshot = await childProgressSnapshot("child-77");

    expect(snapshot.seedBalance).toBe(4);
    expect(snapshot.completedToday).toBe(1);
    expect(snapshot.totalLoggedToday).toBe(2);
  });
});
