import { ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_NUDGES } from "../constants/nudges";
import { fetchNudges, NudgeSetting } from "../services/api";
import {
  cancelNudgeNotifications,
  ensureNotificationPermissions,
  scheduleNudges,
} from "../services/notifications";
import { useAuth } from "./AuthContext";

export const NudgeSyncProvider = ({ children }: { children: ReactNode }) => {
  const { token, profile } = useAuth();
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      if (!token || profile?.role !== "CHILD") {
        setPermissionGranted(false);
        await cancelNudgeNotifications();
        return;
      }

      const granted = await ensureNotificationPermissions();
      setPermissionGranted(granted);
    };

    void bootstrap();
  }, [token, profile?.role]);

  const nudgesQuery = useQuery({
    queryKey: ["nudges", token],
    queryFn: () => fetchNudges(token!),
    enabled: Boolean(token && profile?.role === "CHILD" && permissionGranted),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const resolvedNudges = useMemo(() => {
    const data = (nudgesQuery.data as NudgeSetting[] | undefined) ?? [];
    if (data.length > 0) {
      return data;
    }
    return DEFAULT_NUDGES.map((entry) => ({
      id: `default-${entry.type}`,
      childId: profile?.id ?? "self",
      type: entry.type,
      label: entry.label,
      time: entry.time,
      message: entry.message,
      enabled: true,
      updatedAt: new Date().toISOString(),
    }));
  }, [nudgesQuery.data, profile?.id]);

  useEffect(() => {
    if (!token || profile?.role !== "CHILD" || !permissionGranted) {
      return;
    }

    const applySchedule = async () => {
      await scheduleNudges(
        resolvedNudges.map((entry) => ({
          type: entry.type,
          label: entry.label,
          time: entry.time,
          enabled: entry.enabled,
        })),
      );
    };

    void applySchedule();
  }, [token, profile?.role, permissionGranted, resolvedNudges]);

  return <>{children}</>;
};
