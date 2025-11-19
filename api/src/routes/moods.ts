import { Router } from "express";
import { prisma, UserRole, MoodLevel } from "../prisma";
import { authMiddleware, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requireRole(UserRole.CHILD),
  async (req: AuthenticatedRequest, res) => {
    const { mood, note } = req.body as { mood?: MoodLevel; note?: string };
    if (!mood) {
      return res.status(400).json({ error: "mood is required" });
    }

    const entry = await prisma.moodEntry.create({
      data: {
        mood,
        note,
        userId: req.user!.id,
      },
    });

    return res.status(201).json(entry);
  },
);

router.get("/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const entries = await prisma.moodEntry.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return res.json(entries);
});

router.get(
  "/family",
  authMiddleware,
  requireRole(UserRole.PARENT),
  async (req: AuthenticatedRequest, res) => {
    const moods = await prisma.moodEntry.findMany({
      where: {
        user: {
          familyId: req.user?.familyId ?? undefined,
          role: UserRole.CHILD,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return res.json(
      moods.map((entry) => ({
        id: entry.id,
        child: entry.user,
        mood: entry.mood,
        createdAt: entry.createdAt,
        note: entry.note,
      })),
    );
  },
);

export default router;
