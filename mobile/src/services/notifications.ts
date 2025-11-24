import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { DEFAULT_NUDGES } from "../constants/nudges";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const NUDGE_SCOPE = "daily-buddies-nudge";
const NUDGE_CHANNEL_ID = "nudges";

export type SchedulableNudge = {
  type: string;
  label: string;
  time: string;
  message?: string | null;
  enabled: boolean;
};

const templateByType = new Map(DEFAULT_NUDGES.map((entry) => [entry.type, entry]));

const parseTime = (value: string): { hour: number; minute: number } | null => {
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") {
    return;
  }
  await Notifications.setNotificationChannelAsync(NUDGE_CHANNEL_ID, {
    name: "Daily Buddies nudges",
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
};

export const ensureNotificationPermissions = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  const hasAccess =
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    current.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;

  if (hasAccess) {
    await ensureAndroidChannel();
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowProvisional: true,
    },
  });

  const granted =
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  if (granted) {
    await ensureAndroidChannel();
  }

  return granted;
};

export const cancelNudgeNotifications = async () => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scoped = scheduled.filter(
    (entry) => (entry.content.data as Record<string, unknown>)?.scope === NUDGE_SCOPE,
  );

  await Promise.all(scoped.map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)));
};

export const scheduleNudges = async (nudges: SchedulableNudge[]) => {
  await cancelNudgeNotifications();

  for (const nudge of nudges) {
    if (!nudge.enabled) continue;
    const parsed = parseTime(nudge.time);
    if (!parsed) continue;

    const template = templateByType.get(nudge.type);
    const body = nudge.message ?? template?.message ?? "Friendly reminder from Daily Buddies.";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: nudge.label || template?.label || "Daily Buddies",
        body,
        data: {
          scope: NUDGE_SCOPE,
          type: nudge.type,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hour,
        minute: parsed.minute,
        channelId: Platform.OS === "android" ? NUDGE_CHANNEL_ID : undefined,
      },
    });
  }
};
