import { getLocalTimeZone, parseDate, today, type CalendarDate } from "@internationalized/date";

/** `?date=YYYY-MM-DD` opens a calendar on that day; anything else falls back to today. */
export function initialDay(requested: string | null): CalendarDate {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    try {
      return parseDate(requested);
    } catch {
      return today(getLocalTimeZone());
    }
  }
  return today(getLocalTimeZone());
}
