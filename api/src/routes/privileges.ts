import { Router } from "express";
import { prisma, UserRole, PrivilegeRequestStatus } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { calculateSeedBalance } from "../services/progress";

const router = Router();

router.get(
  "/",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const definitions = await prisma.privilegeDefinition.findMany({
      where: { familyId: req.user.familyId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(definitions);
  },
);

router.post(
  "/",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { title, description, cost } = req.body as {
      title?: string;
      description?: string;
      cost?: number;
    };

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const definition = await prisma.privilegeDefinition.create({
      data: {
        title,
        description,
        cost: Math.max(1, cost ?? 1),
        familyId: req.user.familyId,
        createdById: req.user.id,
      },
    });

    return res.status(201).json(definition);
  },
);

router.patch(
  "/:privilegeId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { privilegeId } = req.params;
    if (!privilegeId) {
      return res.status(400).json({ error: "privilegeId is required" });
    }

    const definition = await prisma.privilegeDefinition.findUnique({ where: { id: privilegeId } });
    if (!definition || definition.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Privilege not found" });
    }

    const { title, description, cost } = req.body as {
      title?: string;
      description?: string | null;
      cost?: number;
    };

    const updated = await prisma.privilegeDefinition.update({
      where: { id: privilegeId },
      data: {
        title,
        description,
        cost: typeof cost === "number" ? Math.max(1, cost) : undefined,
      },
    });

    return res.json(updated);
  },
);

router.delete(
  "/:privilegeId",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { privilegeId } = req.params;
    if (!privilegeId) {
      return res.status(400).json({ error: "privilegeId is required" });
    }

    const definition = await prisma.privilegeDefinition.findUnique({ where: { id: privilegeId } });
    if (!definition || definition.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Privilege not found" });
    }

    await prisma.$transaction([
      prisma.privilegeRequest.deleteMany({ where: { privilegeId } }),
      prisma.privilegeDefinition.delete({ where: { id: privilegeId } }),
    ]);

    return res.json({ success: true });
  },
);

router.post(
  "/:privilegeId/request",
  authMiddleware,
  requireRole(UserRole.CHILD),
  async (req: AuthenticatedRequest, res) => {
    const { privilegeId } = req.params;
    if (!privilegeId) {
      return res.status(400).json({ error: "privilegeId is required" });
    }

    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const definition = await prisma.privilegeDefinition.findUnique({ where: { id: privilegeId } });
    if (!definition || definition.familyId !== req.user.familyId) {
      return res.status(404).json({ error: "Privilege not found" });
    }

    const existing = await prisma.privilegeRequest.findFirst({
      where: {
        childId: req.user.id,
        privilegeId,
        status: PrivilegeRequestStatus.PENDING,
      },
    });

    if (existing) {
      return res.status(409).json({ error: "Request already pending" });
    }

    const balance = await calculateSeedBalance(req.user.id);
    if (balance < definition.cost) {
      return res.status(400).json({ error: "Not enough seeds to request this privilege" });
    }

    const request = await prisma.privilegeRequest.create({
      data: {
        privilegeId,
        childId: req.user.id,
        familyId: req.user.familyId,
        cost: definition.cost,
      },
      include: {
        privilege: true,
        child: { select: { id: true, name: true, avatarTone: true } },
      },
    });

    return res.status(201).json(request);
  },
);

router.get(
  "/requests",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user?.familyId) {
      return res.status(400).json({ error: "Family not linked yet" });
    }

    const requests = await prisma.privilegeRequest.findMany({
      where: { familyId: req.user.familyId },
      orderBy: { createdAt: "desc" },
      include: {
        privilege: true,
        child: { select: { id: true, name: true, avatarTone: true } },
      },
    });

    return res.json(requests);
  },
);

router.get(
  "/my-requests",
  authMiddleware,
  requireRole(UserRole.CHILD),
  async (req: AuthenticatedRequest, res) => {
    const requests = await prisma.privilegeRequest.findMany({
      where: { childId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        privilege: true,
      },
    });

    return res.json(requests);
  },
);

router.post(
  "/requests/:requestId/decision",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { requestId } = req.params;
    const { status, note } = req.body as { status?: PrivilegeRequestStatus; note?: string };

    if (!requestId || !status || !Object.values(PrivilegeRequestStatus).includes(status)) {
      return res.status(400).json({ error: "status is required" });
    }

    const request = await prisma.privilegeRequest.findUnique({
      where: { id: requestId },
      include: { privilege: true },
    });

    if (!request || request.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== PrivilegeRequestStatus.PENDING) {
      return res.status(400).json({ error: "Request already processed" });
    }

    if (status === PrivilegeRequestStatus.APPROVED) {
      const balance = await calculateSeedBalance(request.childId);
      if (balance < request.cost) {
        return res.status(400).json({ error: "Child does not have enough seeds anymore" });
      }
    }

    const updated = await prisma.privilegeRequest.update({
      where: { id: requestId },
      data: {
        status,
        note,
        resolvedAt: new Date(),
      },
      include: {
        privilege: true,
        child: { select: { id: true, name: true, avatarTone: true } },
      },
    });

    return res.json(updated);
  },
);

router.post(
  "/requests/:requestId/terminate",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { requestId } = req.params;
    const { note } = req.body as { note?: string };

    if (!requestId) {
      return res.status(400).json({ error: "requestId is required" });
    }

    const request = await prisma.privilegeRequest.findUnique({
      where: { id: requestId },
      include: {
        privilege: true,
        child: { select: { id: true, name: true, avatarTone: true } },
      },
    });

    if (!request || request.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== PrivilegeRequestStatus.APPROVED) {
      return res.status(400).json({ error: "Only approved tickets can be terminated" });
    }

    const terminated = await prisma.privilegeRequest.update({
      where: { id: requestId },
      data: {
        status: PrivilegeRequestStatus.TERMINATED,
        note,
        resolvedAt: new Date(),
      },
      include: {
        privilege: true,
        child: { select: { id: true, name: true, avatarTone: true } },
      },
    });

    return res.json(terminated);
  },
);

export default router;
