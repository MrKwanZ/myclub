/** Calendar date in the machine's local timezone, YYYY-MM-DD. */
export function localISODate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localISODate(date);
}

/** Monday-first month grid. Null cells are the padding days. */
export function monthGrid(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) {
    const month = String(monthIndex + 1).padStart(2, "0");
    const date = String(day).padStart(2, "0");
    cells.push(`${year}-${month}-${date}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthBounds(year: number, monthIndex: number) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
  };
}

export function shiftMonth(year: number, monthIndex: number, delta: number) {
  const date = new Date(year, monthIndex + delta, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function monthTitle(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function formatLongDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Event card title, for example "6 Nov 2026 (Fri)". */
export function formatEventCardDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  return `${label} (${weekday})`;
}

export function formatEventWhen(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${label} · ${time}`;
}

export function resultFromScores(scoreFor: number, scoreAgainst: number) {
  if (scoreFor > scoreAgainst) return "win" as const;
  if (scoreFor < scoreAgainst) return "loss" as const;
  return "draw" as const;
}

export function attendanceLabel(status: string) {
  switch (status) {
    case "present":
      return "Present";
    case "absent":
      return "Absent";
    case "maybe":
      return "Maybe";
    case "late":
      return "Late";
    default:
      return "No reply";
  }
}

/** True once the event's local start time has been reached. */
export function eventHasStarted(date: string, startTime: string, now = new Date()) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
  return now.getTime() >= start.getTime();
}

/**
 * Player history label. A missing reply is Absent. Maybe stays Maybe until the
 * event starts, then it counts as Absent.
 */
export function playerHistoryLabel(status: string, started: boolean) {
  if (!status || status === "unanswered" || (status === "maybe" && started)) return "Absent";
  return attendanceLabel(status);
}

/** Roster form guide. Past Present/Late is "S"; every other past reply is "A". */
export function rosterAttendanceMark(status: string, started: boolean): "S" | "A" | null {
  if (!started) return null;
  if (status === "present" || status === "late") return "S";
  return "A";
}

export function recorderLabel(recordedBy: string | null, viewer: "manager" | "player") {
  if (recordedBy === "player") return viewer === "player" ? "You replied" : "Player replied";
  if (recordedBy === "manager") return "Manager recorded";
  return "No reply";
}

/** Day and short month, for example "12 Jan". */
export function formatDayMonth(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Local date and 12-hour time, for example "09/11/2026 11:52 AM". */
export function formatRepliedAt(iso: string | null) {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = date.getHours() >= 12 ? "PM" : "AM";
  const hour12 = date.getHours() % 12 || 12;
  const hours = String(hour12).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes} ${meridiem}`;
}
