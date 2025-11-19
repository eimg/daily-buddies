import { Router } from "express";
import { prisma, UserRole } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { calculateSeedBalance } from "../services/progress";

const router = Router();

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const familyId = req.user?.familyId;
  if (!familyId) {
    return res.status(400).json({ error: "Family not linked yet" });
  }

  const rewards = await prisma.rewardDefinition.findMany({
    where: { familyId },
    orderBy: { cost: "asc" },
  });

  if (req.user?.role === UserRole.CHILD) {
    const seedBalance = await calculateSeedBalance(req.user.id);
    return res.json({ rewards, seedBalance });
  }

  const redemptions = await prisma.rewardRedemption.findMany({
    where: {
      reward: { familyId },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      child: { select: { id: true, name: true } },
      reward: { select: { title: true } },
    },
  });

  return res.json({ rewards, redemptions });
});

router.post(
  "/",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const { title, description, cost } = req.body;

    if (!title || typeof cost !== "number") {
      return res.status(400).json({ error: "title and numeric cost are required" });
    }

    const reward = await prisma.rewardDefinition.create({
      data: {
        title,
        description,
        cost,
        familyId: req.user?.familyId!,
        createdById: req.user!.id,
      },
    });

    return res.status(201).json(reward);
  },
);

router.post(
  "/:rewardId/redeem",
  authMiddleware,
  requireRole(UserRole.CHILD),
  async (req: AuthenticatedRequest, res) => {
    const { rewardId } = req.params;
    if (!rewardId) {
      return res.status(400).json({ error: "Reward id is required" });
    }
    const { note } = req.body;

    const reward = await prisma.rewardDefinition.findUnique({ where: { id: rewardId } });
    if (!reward || reward.familyId !== req.user?.familyId) {
      return res.status(404).json({ error: "Reward not found" });
    }

    const balance = await calculateSeedBalance(req.user!.id);
    if (balance < reward.cost) {
      return res.status(400).json({ error: "Not enough seeds yet" });
    }

    const redemption = await prisma.rewardRedemption.create({
      data: {
        rewardId,
        childId: req.user!.id,
        seedsSpent: reward.cost,
        note,
      },
      include: {
        reward: true,
      },
    });

    const updatedBalance = balance - reward.cost;

    return res.json({ redemption, balance: updatedBalance });
  },
);

export default router;
