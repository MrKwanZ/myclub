import { localISODate } from "@myclub/shared";

/** Store a calendar date as UTC midnight so Postgres `date` round-trips. */
export function utcDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoFromDb(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function todayUtc() {
  return utcDate(localISODate());
}

export function moneyToString(value: { toFixed(digits: number): string }) {
  return value.toFixed(2);
}
