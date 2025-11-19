import { Router } from "express";
import authRoutes from "./auth";
import taskRoutes from "./tasks";
import rewardRoutes from "./rewards";
import privilegeRoutes from "./privileges";
import moodRoutes from "./moods";
import noteRoutes from "./notes";
import missionRoutes from "./missions";
import dashboardRoutes from "./dashboard";
import routineRoutes from "./routines";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/tasks", taskRoutes);
router.use("/rewards", rewardRoutes);
router.use("/privileges", privilegeRoutes);
router.use("/moods", moodRoutes);
router.use("/notes", noteRoutes);
router.use("/missions", missionRoutes);
router.use("/routines", routineRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
