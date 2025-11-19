export function startOfDayUTC(dateInput?: Date | string) {
  const date = dateInput ? new Date(dateInput) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
