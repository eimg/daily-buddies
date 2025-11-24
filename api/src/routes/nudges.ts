import { Router } from "express";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware/auth";
import { prisma, UserRole } from "../prisma";
import { DEFAULT_NUDGE_TEMPLATES } from "../constants/nudges";

const router = Router();

const TIME_REGEX = /^(\d{1,2}):([0-5]\d)$/;

const normalizeTime = (value?: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(TIME_REGEX);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || hour > 23 || minute > 59) {
    return null;
  }

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

async function ensureDefaultsForChild(familyId: string, childId: string) {
  for (const template of DEFAULT_NUDGE_TEMPLATES) {
    await prisma.nudgeSetting.upsert({
      where: {
        childId_type: {
          childId,
          type: template.type,
        },
      },
      update: {},
      create: {
        familyId,
        childId,
        type: template.type,
        label: template.label,
        time: template.time,
        message: template.message,
        enabled: true,
      },
    });
  }
}

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const familyId = req.user?.familyId;
  if (!familyId) {
    return res.status(400).json({ error: "Family not linked yet" });
  }

  const requestedChildId = typeof req.query.childId === "string" ? req.query.childId : undefined;
  const defaultsByType = Object.fromEntries(DEFAULT_NUDGE_TEMPLATES.map((entry) => [entry.type, entry]));

  if (req.user?.role === UserRole.CHILD) {
    await ensureDefaultsForChild(familyId, req.user.id);
    const nudges = await prisma.nudgeSetting.findMany({
      where: { childId: req.user.id },
      orderBy: { type: "asc" },
    });

    return res.json(
      nudges.map((nudge) => ({
        id: nudge.id,
        childId: nudge.childId,
        type: nudge.type,
        label: nudge.label || defaultsByType[nudge.type]?.label || nudge.type,
        time: nudge.time,
        message: nudge.message ?? defaultsByType[nudge.type]?.message,
        enabled: nudge.enabled,
        updatedAt: nudge.updatedAt,
      })),
    );
  }

  const children = await prisma.user.findMany({
    where: { familyId, role: UserRole.CHILD },
    select: { id: true, name: true, avatarTone: true },
  });

  const childIds = requestedChildId ? [requestedChildId] : children.map((child) => child.id);

  if (requestedChildId && !children.some((child) => child.id === requestedChildId)) {
    return res.status(404).json({ error: "Child not found in this family" });
  }

  await Promise.all(childIds.map((childId) => ensureDefaultsForChild(familyId, childId)));

  const nudges = await prisma.nudgeSetting.findMany({
    where: {
      childId: { in: childIds },
    },
    include: {
      child: { select: { id: true, name: true, avatarTone: true } },
    },
    orderBy: [{ childId: "asc" }, { type: "asc" }],
  });

    const payload = nudges.map((nudge) => ({
      id: nudge.id,
      childId: nudge.childId,
      childName: nudge.child?.name,
      childAvatarTone: nudge.child?.avatarTone,
      type: nudge.type,
      label: nudge.label || defaultsByType[nudge.type]?.label || nudge.type,
      time: nudge.time,
      message: nudge.message ?? defaultsByType[nudge.type]?.message,
      enabled: nudge.enabled,
      updatedAt: nudge.updatedAt,
    }));

  return res.json(payload);
});

router.patch(
  "/",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const familyId = req.user?.familyId;
    if (!familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const { childId, nudges } = req.body as {
      childId?: string;
      nudges?: { type?: string; time?: string; enabled?: boolean; message?: string | null }[];
    };

    if (!childId || !Array.isArray(nudges)) {
      return res.status(400).json({ error: "childId and nudges array are required" });
    }

    const child = await prisma.user.findUnique({
      where: { id: childId },
      select: { id: true, familyId: true, role: true },
    });

    if (!child || child.familyId !== familyId || child.role !== UserRole.CHILD) {
      return res.status(404).json({ error: "Child not found in this family" });
    }

    const allowedTypes = new Set(DEFAULT_NUDGE_TEMPLATES.map((entry) => entry.type));
    const updates = nudges
      .map((entry) => ({
        type: entry.type,
        time: normalizeTime(entry.time),
        enabled: entry.enabled ?? true,
        message: typeof entry.message === "string" ? entry.message.trim() || null : null,
      }))
      .filter((entry) => entry.type && entry.time) as {
        type: string;
        time: string;
        enabled: boolean;
        message: string | null;
      }[];

    if (updates.length === 0) {
      return res.status(400).json({ error: "At least one valid nudge update is required" });
    }

    for (const update of updates) {
      if (!allowedTypes.has(update.type)) {
        return res.status(400).json({ error: `Unsupported nudge type: ${update.type}` });
      }
    }

    await ensureDefaultsForChild(familyId, childId);

    await prisma.$transaction(
      updates.map((entry) =>
        prisma.nudgeSetting.update({
          where: { childId_type: { childId, type: entry.type } },
          data: { time: entry.time, enabled: entry.enabled, message: entry.message },
        }),
      ),
    );

    const refreshed = await prisma.nudgeSetting.findMany({
      where: { childId },
      include: {
        child: { select: { id: true, name: true, avatarTone: true } },
      },
      orderBy: { type: "asc" },
    });

    const defaultsByType = Object.fromEntries(DEFAULT_NUDGE_TEMPLATES.map((entry) => [entry.type, entry]));

    return res.json(
      refreshed.map((nudge) => ({
        id: nudge.id,
        childId: nudge.childId,
        childName: nudge.child?.name,
        childAvatarTone: nudge.child?.avatarTone,
        type: nudge.type,
        label: nudge.label || defaultsByType[nudge.type]?.label || nudge.type,
        time: nudge.time,
        enabled: nudge.enabled,
        message: nudge.message ?? defaultsByType[nudge.type]?.message,
        updatedAt: nudge.updatedAt,
      })),
    );
  },
);

export default router;
