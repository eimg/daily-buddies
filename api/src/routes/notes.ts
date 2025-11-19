import { Router } from "express";
import { prisma, UserRole } from "../prisma";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { CHILD_NOTE_TEMPLATES, PARENT_NOTE_TEMPLATES } from "../constants/templates";

const router = Router();

router.get("/templates", authMiddleware, (req: AuthenticatedRequest, res) => {
  const templates =
    req.user?.role === UserRole.PARENT ? PARENT_NOTE_TEMPLATES : CHILD_NOTE_TEMPLATES;
  return res.json(templates);
});

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const notes = await prisma.kindNote.findMany({
    where: {
      OR: [{ fromUserId: req.user!.id }, { toUserId: req.user!.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      fromUser: { select: { id: true, name: true, role: true } },
      toUser: { select: { id: true, name: true, role: true } },
    },
  });

  return res.json(notes);
});

router.get("/family", authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user?.familyId) {
    return res.status(400).json({ error: "Family not linked yet" });
  }

  const notes = await prisma.kindNote.findMany({
    where: {
      fromUser: { familyId: req.user.familyId },
      toUser: { familyId: req.user.familyId },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      fromUser: { select: { id: true, name: true, role: true } },
      toUser: { select: { id: true, name: true, role: true } },
    },
  });

  return res.json(notes);
});

router.post("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { templateKey, toUserId, customMessage } = req.body;

  if (!templateKey || !toUserId) {
    return res.status(400).json({ error: "templateKey and toUserId are required" });
  }

  const templates =
    req.user?.role === UserRole.PARENT ? PARENT_NOTE_TEMPLATES : CHILD_NOTE_TEMPLATES;
  const template = templates.find((entry) => entry.key === templateKey);

  if (!template) {
    return res.status(400).json({ error: "Template not available for this user" });
  }

  const recipient = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { familyId: true },
  });

  if (!recipient || recipient.familyId !== req.user?.familyId) {
    return res.status(404).json({ error: "Recipient not found" });
  }

  const note = await prisma.kindNote.create({
    data: {
      fromUserId: req.user!.id,
      toUserId,
      templateKey,
      message: customMessage ?? template.text,
    },
  });

  return res.status(201).json(note);
});

export default router;
