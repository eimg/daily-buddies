import { Router } from "express";
import { prisma, UserRole, TeamMissionStatus } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user?.familyId) {
    return res.status(400).json({ error: "Family not linked yet" });
  }

  const missions = await prisma.teamMission.findMany({
    where: { familyId: req.user.familyId },
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      },
    },
  });

  return res.json(
    missions.map((mission) => ({
      id: mission.id,
      title: mission.title,
      description: mission.description,
      status: mission.status,
      seedsReward: mission.seedsReward,
      completedAt: mission.completedAt,
      participants: mission.participants.map((participant) => participant.user),
    })),
  );
});

router.post(
  "/",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { title, description, seedsReward, participantIds } = req.body;
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const mission = await prisma.teamMission.create({
      data: {
        title,
        description,
        seedsReward: typeof seedsReward === "number" ? seedsReward : 5,
        familyId: req.user?.familyId!,
        participants:
          Array.isArray(participantIds) && participantIds.length > 0
            ? {
                create: participantIds.map((userId: string) => ({ userId })),
              }
            : undefined,
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    return res.status(201).json(mission);
  },
);

router.post(
  "/:missionId/join",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { missionId } = req.params;
    if (!missionId) {
      return res.status(400).json({ error: "Mission id is required" });
    }

    const mission = await prisma.teamMission.findUnique({ where: { id: missionId } });
    if (!mission || mission.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Mission not found" });
    }

    const existing = await prisma.teamParticipant.findFirst({
      where: { missionId, userId: req.user!.id },
    });

    if (existing) {
      return res.json(existing);
    }

    const participant = await prisma.teamParticipant.create({
      data: {
        missionId,
        userId: req.user!.id,
      },
    });

    return res.status(201).json(participant);
  },
);

router.post(
  "/:missionId/complete",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { missionId } = req.params;
    if (!missionId) {
      return res.status(400).json({ error: "Mission id is required" });
    }

    const mission = await prisma.teamMission.findUnique({
      where: { id: missionId },
      include: {
        participants: true,
      },
    });

    if (!mission || mission.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Mission not found" });
    }

    if (mission.status === TeamMissionStatus.COMPLETED) {
      return res.status(400).json({ error: "Mission already completed" });
    }

    const updatedMission = await prisma.teamMission.update({
      where: { id: missionId },
      data: {
        status: TeamMissionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const rewards = await prisma.$transaction(
      mission.participants.map((participant) =>
        prisma.missionReward.create({
          data: {
            missionId: mission.id,
            userId: participant.userId,
            seedsEarned: mission.seedsReward,
          },
        }),
      ),
    );

    return res.json({
      mission: updatedMission,
      rewards,
    });
  },
);

export default router;
