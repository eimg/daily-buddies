import { Router } from "express";
import { Prisma, prisma, UserRole, FrequencyType, ReminderStyle } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

const normalizeDaysInput = (
  days?: string[],
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue => {
  if (!days || days.length === 0) {
    return Prisma.JsonNull;
  }
  const normalized = days
    .map((day) => day.trim().slice(0, 3).toUpperCase())
    .filter(Boolean) as string[];
  return normalized.length > 0 ? (normalized as Prisma.JsonArray) : Prisma.JsonNull;
};

router.get(
  "/templates",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const templates = await prisma.routineTemplate.findMany({
      where: { familyId: req.user?.familyId ?? undefined },
      include: {
        items: {
          orderBy: { title: "asc" },
        },
        assignments: {
          include: {
            child: { select: { id: true, name: true, avatarTone: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(
      templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        frequency: template.frequency,
        daysOfWeek: (template.daysOfWeek as string[] | null) ?? null,
        rewardNote: template.rewardNote,
        createdAt: template.createdAt,
        items: template.items,
        assignments: template.assignments.map((assignment) => ({
          id: assignment.id,
          childId: assignment.childId,
          childName: assignment.child.name,
          childAvatarTone: assignment.child.avatarTone,
        })),
      })),
    );
  },
);

router.post(
  "/templates",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { name, description, frequency, rewardNote, items, daysOfWeek } = req.body as {
      name?: string;
      description?: string;
      frequency?: FrequencyType;
      rewardNote?: string;
      daysOfWeek?: string[];
      items?: Array<{
        title?: string;
        description?: string;
        icon?: string;
        points?: number;
        reminderStyle?: ReminderStyle;
      }>;
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    if (!items?.length) {
      return res.status(400).json({ error: "Provide at least one task item" });
    }

    const normalizedDays = normalizeDaysInput(daysOfWeek);

    const template = await prisma.routineTemplate.create({
      data: {
        name,
        description,
        frequency: frequency ?? FrequencyType.DAILY,
        daysOfWeek: normalizedDays,
        rewardNote,
        familyId: req.user!.familyId!,
        createdById: req.user!.id,
        items: {
          create: items.map((item) => ({
            title: item.title ?? "Task",
            description: item.description,
            icon: item.icon,
            points: item.points ?? 1,
            reminderStyle: item.reminderStyle ?? ReminderStyle.FRIENDLY,
          })),
        },
      },
      include: { items: true },
    });

    return res.status(201).json(template);
  },
);

router.post(
  "/templates/:templateId/assign",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { templateId } = req.params;
    const { childId } = req.body as { childId?: string };

    if (!childId) {
      return res.status(400).json({ error: "childId is required" });
    }

    const template = await prisma.routineTemplate.findUnique({
      where: { id: templateId },
      include: { items: true },
    });

    if (!template || template.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Template not found" });
    }

    const child = await prisma.user.findUnique({
      where: { id: childId },
    });

    if (!child || child.familyId !== req.user.familyId || child.role !== UserRole.CHILD) {
      return res.status(404).json({ error: "Child not found" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdTasks = [];
      for (const item of template.items) {
        const createdTask = await tx.task.create({
          data: {
            title: item.title,
            description: item.description,
            icon: item.icon,
            reminderStyle: item.reminderStyle,
            frequency: template.frequency,
            daysOfWeek: template.daysOfWeek ?? Prisma.JsonNull,
            points: item.points,
            familyId: template.familyId,
            createdById: req.user!.id,
            routineTemplateId: template.id,
            assignments: {
              create: { childId },
            },
          },
        });
        createdTasks.push(createdTask);
      }

      await tx.routineAssignment.create({
        data: {
          templateId: template.id,
          childId,
        },
      });

      return createdTasks;
    });

    return res.status(201).json({ tasks: result });
  },
);

router.delete(
  "/templates/:templateId/assign/:childId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { templateId, childId } = req.params;

    if (!templateId || !childId) {
      return res.status(400).json({ error: "templateId and childId are required" });
    }

    const template = await prisma.routineTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || template.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Template not found" });
    }

    const assignment = await prisma.routineAssignment.findFirst({
      where: { templateId, childId },
    });

    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    await prisma.$transaction(async (tx) => {
      const tasksForChild = await tx.task.findMany({
        where: {
          routineTemplateId: templateId,
          assignments: { some: { childId } },
        },
        select: {
          id: true,
          assignments: { select: { childId: true } },
        },
      });

      const taskIds = tasksForChild.map((task) => task.id);
      if (taskIds.length > 0) {
        await tx.taskCompletion.deleteMany({
          where: {
            taskId: { in: taskIds },
            childId,
          },
        });

        await tx.taskAssignment.deleteMany({
          where: {
            taskId: { in: taskIds },
            childId,
          },
        });

        const removableTaskIds = tasksForChild
          .filter((task) => task.assignments.length <= 1)
          .map((task) => task.id);

        if (removableTaskIds.length > 0) {
          await tx.task.deleteMany({
            where: { id: { in: removableTaskIds } },
          });
        }
      }

      await tx.routineAssignment.deleteMany({
        where: {
          templateId,
          childId,
        },
      });
    });

    return res.json({ success: true });
  },
);

router.get(
  "/templates/:templateId",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { templateId } = req.params;
    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const template = await prisma.routineTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: { orderBy: { title: "asc" } },
        assignments: {
          include: {
            child: { select: { id: true, name: true, avatarTone: true } },
          },
        },
      },
    });

    if (!template || template.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Template not found" });
    }

    return res.json({
      id: template.id,
      name: template.name,
      description: template.description,
      rewardNote: template.rewardNote,
      frequency: template.frequency,
      daysOfWeek: (template.daysOfWeek as string[] | null) ?? null,
      items: template.items,
      assignments: template.assignments.map((assignment) => ({
        id: assignment.id,
        childId: assignment.childId,
        childName: assignment.child.name,
        childAvatarTone: assignment.child.avatarTone,
      })),
    });
  },
);

router.patch(
  "/templates/:templateId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { templateId } = req.params;
    const { name, description, rewardNote, frequency, daysOfWeek, items } = req.body as {
      name?: string;
      description?: string;
      rewardNote?: string;
      frequency?: FrequencyType;
      daysOfWeek?: string[];
      items?: Array<{
        title?: string;
        description?: string;
        icon?: string;
        points?: number;
        reminderStyle?: ReminderStyle;
      }>;
    };

    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Provide at least one routine task" });
    }

    const template = await prisma.routineTemplate.findUnique({
      where: { id: templateId },
      include: {
        assignments: true,
      },
    });

    if (!template || template.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Template not found" });
    }

    const normalizedDays = normalizeDaysInput(daysOfWeek);

    await prisma.$transaction(async (tx) => {
      await tx.routineTemplate.update({
        where: { id: templateId },
        data: {
          name,
          description,
          rewardNote,
          frequency,
          daysOfWeek: normalizedDays,
        },
      });

      await tx.routineTemplateItem.deleteMany({ where: { templateId } });

      await Promise.all(
        items.map((item) =>
          tx.routineTemplateItem.create({
            data: {
              templateId,
              title: item.title ?? "Task",
              description: item.description,
              icon: item.icon,
              points: item.points ?? 1,
              reminderStyle: item.reminderStyle ?? ReminderStyle.FRIENDLY,
            },
          }),
        ),
      );

      await tx.taskCompletion.deleteMany({
        where: { task: { routineTemplateId: templateId } },
      });

      await tx.taskAssignment.deleteMany({
        where: { task: { routineTemplateId: templateId } },
      });

      await tx.task.deleteMany({
        where: { routineTemplateId: templateId },
      });

      const refreshedItems = await tx.routineTemplateItem.findMany({
        where: { templateId },
        orderBy: { title: "asc" },
      });

      const assignments = await tx.routineAssignment.findMany({
        where: { templateId },
      });

      for (const assignment of assignments) {
        for (const item of refreshedItems) {
          await tx.task.create({
            data: {
              title: item.title,
              description: item.description,
              icon: item.icon,
              reminderStyle: item.reminderStyle,
              frequency: frequency ?? template.frequency,
              daysOfWeek: normalizedDays,
              points: item.points,
              familyId: template.familyId,
              createdById: req.user!.id,
              routineTemplateId: template.id,
              assignments: {
                create: { childId: assignment.childId },
              },
            },
          });
        }
      }
    });

    const updated = await prisma.routineTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: { orderBy: { title: "asc" } },
        assignments: {
          include: { child: { select: { id: true, name: true, avatarTone: true } } },
        },
      },
    });

    return res.json({
      id: updated!.id,
      name: updated!.name,
      description: updated!.description,
      rewardNote: updated!.rewardNote,
      frequency: updated!.frequency,
      daysOfWeek: (updated!.daysOfWeek as string[] | null) ?? null,
      items: updated!.items,
      assignments: updated!.assignments.map((assignment) => ({
        id: assignment.id,
        childId: assignment.childId,
        childName: assignment.child.name,
        childAvatarTone: assignment.child.avatarTone,
      })),
    });
  },
);

router.delete(
  "/templates/:templateId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { templateId } = req.params;
    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const template = await prisma.routineTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || template.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Template not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskCompletion.deleteMany({
        where: { task: { routineTemplateId: templateId } },
      });
      await tx.taskAssignment.deleteMany({
        where: { task: { routineTemplateId: templateId } },
      });
      await tx.task.deleteMany({
        where: { routineTemplateId: templateId },
      });
      await tx.routineAssignment.deleteMany({
        where: { templateId },
      });
      await tx.routineTemplateItem.deleteMany({
        where: { templateId },
      });
      await tx.routineTemplate.delete({
        where: { id: templateId },
      });
    });

    return res.json({ success: true });
  },
);

export default router;
