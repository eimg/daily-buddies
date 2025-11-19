import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  Prisma,
  UserRole,
  ReminderStyle,
  FrequencyType,
  CompletionStatus,
  MoodLevel,
  TeamMissionStatus,
  PrivilegeRequestStatus,
} from "../src/generated/prisma/client";

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDayUTC = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

async function resetData() {
  await prisma.$transaction([
    prisma.taskAssignment.deleteMany(),
    prisma.routineAssignment.deleteMany(),
    prisma.routineTemplateItem.deleteMany(),
    prisma.routineTemplate.deleteMany(),
    prisma.missionReward.deleteMany(),
    prisma.teamParticipant.deleteMany(),
    prisma.teamMission.deleteMany(),
    prisma.rewardRedemption.deleteMany(),
    prisma.rewardDefinition.deleteMany(),
    prisma.taskCompletion.deleteMany(),
    prisma.task.deleteMany(),
    prisma.kindNote.deleteMany(),
    prisma.moodEntry.deleteMany(),
    prisma.user.deleteMany(),
    prisma.family.deleteMany(),
  ]);
}

async function main() {
  await resetData();

  const family = await prisma.family.create({
    data: {
      name: "Fern Family",
      dailyStreakReward: 3,
      weeklyStreakReward: 5,
      monthlyStreakReward: 15,
      yearlyStreakReward: 75,
    },
  });

  const parent = await prisma.user.create({
    data: {
      name: "Maya Fern",
      username: "maya",
      email: "maya@example.com",
      passwordHash: await hashPassword("parentpass"),
      role: UserRole.PARENT,
      familyId: family.id,
    },
  });

  const luna = await prisma.user.create({
    data: {
      name: "Luna Fern",
      username: "luna",
      email: "luna@example.com",
      passwordHash: await hashPassword("lunapass"),
      role: UserRole.CHILD,
      familyId: family.id,
      parentId: parent.id,
      avatarTone: "sunrise",
    },
  });

  const theo = await prisma.user.create({
    data: {
      name: "Theo Fern",
      username: "theo",
      email: null,
      passwordHash: await hashPassword("theopass"),
      role: UserRole.CHILD,
      familyId: family.id,
      parentId: parent.id,
      avatarTone: "forest",
    },
  });

  const brushTeeth = await prisma.task.create({
    data: {
      title: "Brush Teeth",
      description: "Two whole minutes until the timer giggles.",
      icon: "🦷",
      familyId: family.id,
      createdById: parent.id,
      points: 1,
      reminderStyle: ReminderStyle.FRIENDLY,
      frequency: FrequencyType.DAILY,
      assignments: {
        create: [{ childId: luna.id }, { childId: theo.id }],
      },
    },
  });

  const makeBed = await prisma.task.create({
    data: {
      title: "Make Cozy Bed",
      description: "Smooth blankets + 2 pillows = comfy fort.",
      icon: "🛏️",
      familyId: family.id,
      createdById: parent.id,
      points: 2,
      reminderStyle: ReminderStyle.FRIENDLY,
      frequency: FrequencyType.DAILY,
      assignments: {
        create: [{ childId: luna.id }],
      },
    },
  });

  const feedSprout = await prisma.task.create({
    data: {
      title: "Feed Sprout the Cat",
      description: "Sprout prefers crunchy bits + water refill.",
      icon: "🐾",
      familyId: family.id,
      createdById: parent.id,
      points: 3,
      reminderStyle: ReminderStyle.TIMER,
      frequency: FrequencyType.WEEKDAYS,
      assignments: {
        create: [{ childId: theo.id }],
      },
    },
  });

  const routineDefinitions = [
    {
      name: "Morning Routine",
      description: "Start weekdays with focus.",
      rewardNote: "Complete for +3 seeds",
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      items: [
        { title: "Brush Teeth", icon: "🦷", points: 1 },
        { title: "Tidy Bed", icon: "🛏️", points: 1 },
        { title: "Change School Clothes", icon: "👕", points: 1 },
        { title: "Prepare Bag", icon: "🎒", points: 2 },
      ],
    },
    {
      name: "After School Routine",
      description: "Wind down after classes.",
      daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
      items: [
        { title: "Change Clothes", icon: "👚", points: 1 },
        { title: "Shower", icon: "🚿", points: 2 },
        { title: "Do Homework", icon: "📘", points: 3 },
      ],
    },
    {
      name: "Weekend Routine",
      description: "Cozy weekend reset.",
      daysOfWeek: ["SAT", "SUN"],
      items: [
        { title: "Tidy Room", icon: "🧽", points: 2 },
        { title: "Read a Book", icon: "📖", points: 2 },
      ],
    },
  ];

  const createdTemplates = await Promise.all(
    routineDefinitions.map((definition) =>
      prisma.routineTemplate.create({
        data: {
          name: definition.name,
          description: definition.description,
          frequency: FrequencyType.DAILY,
          daysOfWeek: definition.daysOfWeek ?? null,
          rewardNote: definition.rewardNote,
          familyId: family.id,
          createdById: parent.id,
          items: {
            create: definition.items.map((item) => ({
              title: item.title,
              icon: item.icon,
              points: item.points,
            })),
          },
        },
        include: { items: true },
      }),
    ),
  );

  const routineTaskMap: Record<string, { tasks: { id: string; points: number }[] }> = {};

  const routineAssignments = [
    { name: "Morning Routine", childId: luna.id },
    { name: "After School Routine", childId: luna.id },
    { name: "Weekend Routine", childId: theo.id },
  ];

  for (const assignment of routineAssignments) {
    const template = createdTemplates.find((entry) => entry.name === assignment.name);
    if (!template) continue;

    const tasks = await Promise.all(
      template.items.map((item) =>
        prisma.task.create({
          data: {
            title: item.title,
            description: template.description ?? `Part of ${template.name}`,
            icon: item.icon,
            reminderStyle: ReminderStyle.FRIENDLY,
            frequency: FrequencyType.DAILY,
            daysOfWeek: template.daysOfWeek ?? Prisma.JsonNull,
            points: item.points,
            familyId: family.id,
            createdById: parent.id,
            routineTemplateId: template.id,
            assignments: {
              create: [{ childId: assignment.childId }],
            },
          },
        }),
      ),
    );

    await prisma.routineAssignment.create({
      data: {
        templateId: template.id,
        childId: assignment.childId,
      },
    });

    routineTaskMap[assignment.name] = {
      tasks: tasks.map((task) => ({ id: task.id, points: task.points ?? 1 })),
    };
  }

  const today = startOfDayUTC(new Date());
  const yesterday = startOfDayUTC(new Date(Date.now() - DAY_MS));
  const twoDaysAgo = startOfDayUTC(new Date(Date.now() - 2 * DAY_MS));

  const allRoutineTasks = Object.values(routineTaskMap).flatMap((entry) => entry.tasks);
  if (allRoutineTasks.length === 0) {
    throw new Error("Routine template tasks missing; seed data is out of sync.");
  }

  const morningTask =
    routineTaskMap["Morning Routine"]?.tasks[0] ?? { id: brushTeeth.id, points: brushTeeth.points ?? 1 };
  const weekendTask =
    routineTaskMap["Weekend Routine"]?.tasks[0] ?? { id: feedSprout.id, points: feedSprout.points ?? 1 };

  const historicalDays = Array.from({ length: 10 }, (_, index) =>
    startOfDayUTC(new Date(Date.now() - (index + 3) * DAY_MS)),
  );

  const historicalCompletions = historicalDays.flatMap((date, index) => {
    const routineTask = allRoutineTasks[index % allRoutineTasks.length]!;
    return [
      {
        taskId: brushTeeth.id,
        childId: luna.id,
        date,
        status: CompletionStatus.COMPLETED,
        seedsEarned: 1,
      },
      {
        taskId: makeBed.id,
        childId: luna.id,
        date,
        status: CompletionStatus.COMPLETED,
        seedsEarned: 2,
      },
      {
        taskId: routineTask.id,
        childId: luna.id,
        date,
        status: CompletionStatus.COMPLETED,
        seedsEarned: routineTask.points ?? 2,
      },
    ];
  });

  await prisma.taskCompletion.createMany({
    data: [
      {
        taskId: brushTeeth.id,
        childId: luna.id,
        date: today,
        status: CompletionStatus.COMPLETED,
        seedsEarned: 1,
      },
      {
        taskId: brushTeeth.id,
        childId: theo.id,
        date: today,
        status: CompletionStatus.PENDING,
        seedsEarned: 0,
      },
      {
        taskId: makeBed.id,
        childId: luna.id,
        date: today,
        status: CompletionStatus.COMPLETED,
        seedsEarned: 2,
      },
      {
        taskId: feedSprout.id,
        childId: theo.id,
        date: yesterday,
        status: CompletionStatus.SKIPPED,
        seedsEarned: 0,
      },
      {
        taskId: brushTeeth.id,
        childId: luna.id,
        date: yesterday,
        status: CompletionStatus.COMPLETED,
        seedsEarned: 1,
      },
      {
        taskId: morningTask.id,
        childId: luna.id,
        date: yesterday,
        status: CompletionStatus.COMPLETED,
        seedsEarned: morningTask.points ?? 2,
      },
      {
        taskId: weekendTask.id,
        childId: luna.id,
        date: twoDaysAgo,
        status: CompletionStatus.SKIPPED,
        seedsEarned: 0,
      },
      ...historicalCompletions,
    ],
  });

  const privileges = await Promise.all([
    prisma.privilegeDefinition.create({
      data: {
        familyId: family.id,
        title: "15 min screen time",
        description: "Pick a mini show or game",
        cost: 5,
        createdById: parent.id,
      },
    }),
    prisma.privilegeDefinition.create({
      data: {
        familyId: family.id,
        title: "30 min screen time",
        cost: 8,
        createdById: parent.id,
      },
    }),
    prisma.privilegeDefinition.create({
      data: {
        familyId: family.id,
        title: "30 min play time",
        description: "Parent joins imaginative play",
        cost: 10,
        createdById: parent.id,
      },
    }),
    prisma.privilegeDefinition.create({
      data: {
        familyId: family.id,
        title: "Pick a new toy",
        cost: 25,
        createdById: parent.id,
      },
    }),
  ]);

  await prisma.privilegeRequest.create({
    data: {
      privilegeId: privileges[0].id,
      childId: luna.id,
      familyId: family.id,
      cost: privileges[0].cost,
      status: PrivilegeRequestStatus.APPROVED,
      note: "Friday movie night",
      resolvedAt: new Date(),
    },
  });

  await prisma.privilegeRequest.create({
    data: {
      privilegeId: privileges[1].id,
      childId: luna.id,
      familyId: family.id,
      cost: privileges[1].cost,
      status: PrivilegeRequestStatus.TERMINATED,
      note: "Expired screen time ticket",
      resolvedAt: new Date(),
    },
  });

  const rewards = await prisma.rewardDefinition.createMany({
    data: [
      {
        familyId: family.id,
        title: "Movie Night Boss",
        description: "Pick the snack + the movie.",
        cost: 50,
        createdById: parent.id,
      },
      {
        familyId: family.id,
        title: "Plan Family Dinner",
        description: "Choose the menu and help cook.",
        cost: 120,
        createdById: parent.id,
      },
    ],
  });

  const movieReward = await prisma.rewardDefinition.findFirst({
    where: { familyId: family.id, cost: 50 },
  });

  if (movieReward) {
    await prisma.rewardRedemption.create({
      data: {
        rewardId: movieReward.id,
        childId: luna.id,
        seedsSpent: 50,
        note: "Friday stargazer movie pick",
      },
    });
  }

  await prisma.moodEntry.createMany({
    data: [
      {
        userId: luna.id,
        mood: MoodLevel.SUNNY,
        note: "Ready for Operation Cozy Room!",
      },
      {
        userId: theo.id,
        mood: MoodLevel.TIRED,
        note: "Soccer practice drained energy.",
      },
    ],
  });

  await prisma.kindNote.createMany({
    data: [
      {
        fromUserId: parent.id,
        toUserId: luna.id,
        templateKey: "PROUD",
        message: "I’m proud you kept your reading streak 🌱",
      },
      {
        fromUserId: luna.id,
        toUserId: parent.id,
        templateKey: "NEED_HELP",
        message: "Can we swap piano for watering plants tonight?",
      },
    ],
  });

  const mission = await prisma.teamMission.create({
    data: {
      familyId: family.id,
      title: "Operation Cozy Room",
      description: "Mom + Luna tackle the room reset together.",
      seedsReward: 4,
      status: TeamMissionStatus.COMPLETED,
      completedAt: new Date(),
      participants: {
        create: [{ userId: parent.id }, { userId: luna.id }],
      },
    },
  });

  await prisma.missionReward.createMany({
    data: [
      {
        missionId: mission.id,
        userId: parent.id,
        seedsEarned: 4,
      },
      {
        missionId: mission.id,
        userId: luna.id,
        seedsEarned: 4,
      },
    ],
  });

  console.log("🌱 Seed data ready! Parent login -> maya@example.com / parentpass");
  console.log("   Kids: luna@example.com / lunapass, theo@example.com / theopass");
}

main()
  .catch((error) => {
    console.error("Seed error", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
