import { Router } from "express";
import { prisma, UserRole } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { dayBoundsForTimeZone } from "../utils/dates";

type PointType = "GIFT" | "PENALTY";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_TYPES: PointType[] = ["GIFT", "PENALTY"];

const router = Router();

const mapEntry = (entry: any) => ({
  id: entry.id,
  type: entry.type as PointType,
  points: entry.points,
  amount: Math.abs(entry.points),
  note: entry.note,
  createdAt: entry.createdAt,
  child: entry.child
    ? {
        id: entry.child.id,
        name: entry.child.name,
        username: entry.child.username,
        avatarTone: entry.child.avatarTone,
      }
    : undefined,
  createdBy: entry.createdBy ? { id: entry.createdBy.id, name: entry.createdBy.name } : undefined,
});

const parseLimit = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

const buildDateFilter = (scope: string | undefined, timeZone: string) => {
  if (scope !== "today") {
    return undefined;
  }
  const { start, end } = dayBoundsForTimeZone(timeZone);
  return { gte: start, lt: end };
};

router.post(
  "/",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { childId, amount, type, note } = req.body as {
      childId?: string;
      amount?: number;
      type?: PointType;
      note?: string;
    };

    if (!childId || typeof amount !== "number" || !type) {
      return res.status(400).json({ error: "childId, type, and amount are required" });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid type" });
    }

    const normalizedAmount = Math.abs(Math.trunc(amount));
    if (normalizedAmount <= 0) {
      return res.status(400).json({ error: "amount must be greater than 0" });
    }

    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const child = await prisma.user.findUnique({
      where: { id: childId },
      select: { id: true, familyId: true },
    });

    if (!child || child.familyId !== req.user.familyId) {
      return res.status(404).json({ error: "Child not found" });
    }

    const points = type === "GIFT" ? normalizedAmount : -normalizedAmount;

    const entry = await (prisma as any).pointAdjustment.create({
      data: {
        familyId: req.user.familyId,
        childId,
        createdById: req.user.id,
        points,
        type,
        note: note?.trim() || null,
      },
      include: {
        child: { select: { id: true, name: true, username: true, avatarTone: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json(mapEntry(entry));
  },
);

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
  const childId = typeof req.query.childId === "string" ? req.query.childId : undefined;
  const take = parseLimit(req.query.limit, 10);
  const timeZone = req.user.familyTimezone ?? "UTC";
  const dateFilter = buildDateFilter(scope, timeZone);

  if (req.user.role === UserRole.PARENT) {
    if (!req.user.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }
    const where: Record<string, unknown> = {
      familyId: req.user.familyId,
    };
    if (dateFilter) {
      where.createdAt = dateFilter;
    }
    if (childId) {
      where.childId = childId;
    }
    const entries = await (prisma as any).pointAdjustment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        child: { select: { id: true, name: true, username: true, avatarTone: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    return res.json(entries.map(mapEntry));
  }

  const where: Record<string, unknown> = {
    childId: req.user.id,
  };
  if (dateFilter) {
    where.createdAt = dateFilter;
  }
  const entries = await (prisma as any).pointAdjustment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });
  return res.json(entries.map(mapEntry));
});

router.get(
  "/history",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const childId = typeof req.query.childId === "string" ? req.query.childId : undefined;
    const take = parseLimit(req.query.limit, 50);

    const entries = await (prisma as any).pointAdjustment.findMany({
      where: {
        familyId: req.user.familyId,
        ...(childId ? { childId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        child: { select: { id: true, name: true, username: true, avatarTone: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return res.json(entries.map(mapEntry));
  },
);

export default router;
