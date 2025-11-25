export function startOfDayUTC(dateInput?: Date | string) {
  const date = dateInput ? new Date(dateInput) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

const tzFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const getTimeParts = (date: Date, timeZone: string) => {
  const formatter =
    timeZone === (tzFormatter.resolvedOptions().timeZone ?? "UTC")
      ? tzFormatter
      : new Intl.DateTimeFormat("en-US", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
};

export function startOfDayInTimeZone(timeZone: string, dateInput?: Date | string) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const parts = getTimeParts(date, timeZone);
  const zonedMidnight = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  const currentInstantUtc = date.getTime();
  const zonedInstantUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMs = zonedInstantUtc - currentInstantUtc;
  return new Date(zonedMidnight - offsetMs);
}

export function dayBoundsForTimeZone(timeZone: string, dateInput?: Date | string) {
  const start = startOfDayInTimeZone(timeZone, dateInput);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function weekdayKeyForTimeZone(timeZone: string, dateInput?: Date | string) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const label = formatter.format(date).toUpperCase();
  const map: Record<string, string> = {
    SUN: "SUN",
    MON: "MON",
    TUE: "TUE",
    WED: "WED",
    THU: "THU",
    FRI: "FRI",
    SAT: "SAT",
  };
  return (map[label] as typeof label) ?? "SUN";
}
