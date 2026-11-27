import { z } from "zod";

import { formatDayMonth } from "./dates";
import { clubImportPlayerSchema, csvImportRowLimit } from "./csvImport";
import { canonicalPosition, eventTypeLabel, eventTypes, playerPositions, playerStatuses } from "./labels";
import { jerseyDataUrlSchema, type MatchLineup } from "./lineup";

export * from "./dates";
export * from "./display";
export * from "./labels";
export * from "./lineup";
export {
  clubImportPlayerSchema,
  csvImportBlocked,
  csvImportRowLimit,
  parseClubCsv,
  parseCsv,
  parsedImportValues,
} from "./csvImport";
export type {
  ClubImportPlayer,
  CsvImportColumn,
  CsvImportKind,
  CsvImportRow,
  ParsedClubCsv,
} from "./csvImport";

export function injuryUpdateLabel(player: {
  name: string;
  injuryArea: string;
  expectedReturnDate: string | null;
}) {
  const back = player.expectedReturnDate
    ? `Expected back ${formatDayMonth(player.expectedReturnDate)}`
    : "Unknown return date";
  return player.injuryArea ? `${player.name}: ${player.injuryArea} - ${back}` : `${player.name} - ${back}`;
}

/** Manager toast after a player reports an injury. */
export function injuryStatusMessage(name: string, injuryArea: string, expectedReturnDate: string) {
  return `Player ${name} was reported ${injuryArea} and expected to be returned ${formatDayMonth(expectedReturnDate)}.`;
}

/** Manager toast after a player requests leave. */
export function leaveStatusMessage(name: string, leaveStart: string, leaveEnd: string) {
  return `Player ${name} was requested to leave during ${formatDayMonth(leaveStart)} and ${formatDayMonth(leaveEnd)}.`;
}

export function playerStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Active";
    case "injured":
      return "Injured";
    case "left":
      return "On Leave";
    default:
      return status;
  }
}

export function eventSummary(event: { type: string; opponent: string | null }) {
  if (event.type === "match" || event.type === "friendly") return event.opponent || eventTypeLabel(event.type);
  return eventTypeLabel(event.type);
}
export const matchResults = ["win", "loss", "draw"] as const;
export const attendanceStatuses = ["unanswered", "present", "absent", "maybe", "late"] as const;
export const transactionTypes = ["income", "expense"] as const;
/** Roles this version assigns. `coach` is reserved in the database column and is not offered here. */
export const membershipRoles = ["manager", "player"] as const;
/** Roles an administrator can assign from the admin panel. */
export const adminRoles = ["manager", "player", "admin"] as const;

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email.")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time as HH:mm.");

const contactSchema = z
  .string()
  .trim()
  .max(120, "Contact is too long.")
  .regex(/^[0-9-]*$/, "Contact can only include numbers and hyphens.");

const positionSchema = z
  .string()
  .trim()
  .max(40, "Position is too long.")
  .transform(canonicalPosition)
  .refine(
    (value) => value === "" || (playerPositions as readonly string[]).includes(value),
    "Choose Goalkeeper, Defender, Midfielder, or Forward.",
  );

const moneySchema = z
  .number({ invalid_type_error: "Enter an amount." })
  .positive("Amount must be greater than zero.")
  .max(1_000_000_000, "Amount is too large.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, "Use at most two decimal places.");

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long."),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
});

export const clubWriteSchema = z.object({
  name: z.string().trim().min(1, "Club name is required.").max(120, "Club name is too long."),
  description: z.string().trim().max(4000, "Description is too long.").optional().default(""),
  goals: z.string().trim().max(4000, "Goals are too long.").optional().default(""),
});

const clubLogoSchema = z
  .string()
  .max(2_100_000, "Image is too large.")
  .refine(
    (value) => value.startsWith("data:image/jpeg;base64,") || value.startsWith("data:image/png;base64,"),
    "Unsupported format, please upload a valid image",
  );

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long."),
  contact: contactSchema,
  avatarUrl: clubLogoSchema.optional(),
});

const attendancePercentSchema = z
  .number({ invalid_type_error: "Attendance percentage is required." })
  .int("Use a whole number.")
  .min(1, "Percentage must be from 1 to 100.")
  .max(100, "Percentage must be from 1 to 100.");

export const clubPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Club name is required.").max(120, "Club name is too long.").optional(),
    description: z.string().trim().max(4000, "Description is too long.").optional(),
    goals: z.string().trim().max(4000, "Goals are too long.").optional(),
    logoUrl: clubLogoSchema.optional(),
    jerseys: z.array(jerseyDataUrlSchema).max(12, "Too many jerseys.").optional(),
    attendanceAlertEnabled: z.boolean().optional(),
    attendanceAlertPercent: attendancePercentSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.attendanceAlertEnabled && value.attendanceAlertPercent == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attendance percentage is required.",
        path: ["attendanceAlertPercent"],
      });
    }
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

const shirtNumberSchema = z
  .number({ invalid_type_error: "Shirt number must be a whole number." })
  .int("Shirt number must be a whole number.")
  .min(0, "Shirt number must be from 0 to 99.")
  .max(99, "Shirt number must be from 0 to 99.")
  .nullable()
  .optional();

const injuryAreaSchema = z.string().trim().max(80, "Injury area is too long.");

function refineLeaveRange(
  start: string | null | undefined,
  end: string | null | undefined,
  ctx: z.RefinementCtx,
) {
  if ((start && !end) || (!start && end)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose both leave dates.", path: ["leaveEnd"] });
  }
  if (start && end && end < start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Leave end must be on or after the start.",
      path: ["leaveEnd"],
    });
  }
}

export const playerWriteSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long."),
    position: positionSchema.optional().default(""),
    shirtNumber: shirtNumberSchema,
    contact: contactSchema.optional().default(""),
    status: z.enum(playerStatuses).optional().default("active"),
    goals: z.number().int().min(0).max(999).optional().default(0),
    assists: z.number().int().min(0).max(999).optional().default(0),
    yellowCards: z.number().int().min(0).max(999).optional().default(0),
    redCards: z.number().int().min(0).max(999).optional().default(0),
    playedMinutes: z.number().int().min(0).max(99999).optional().default(0),
    saves: z.number().int().min(0).max(9999).optional().default(0),
    injuryArea: injuryAreaSchema.optional().default(""),
    expectedReturnDate: dateSchema.nullable().optional(),
    leaveStart: dateSchema.nullable().optional(),
    leaveEnd: dateSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "injured" && !value.injuryArea.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Injury Area is required.", path: ["injuryArea"] });
    }
    if (value.status === "left") refineLeaveRange(value.leaveStart, value.leaveEnd, ctx);
  });

export const playerPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long.").optional(),
    position: positionSchema.optional(),
    shirtNumber: shirtNumberSchema,
    contact: contactSchema.optional(),
    status: z.enum(playerStatuses).optional(),
    goals: z.number().int().min(0).max(999).optional(),
    assists: z.number().int().min(0).max(999).optional(),
    yellowCards: z.number().int().min(0).max(999).optional(),
    redCards: z.number().int().min(0).max(999).optional(),
    playedMinutes: z.number().int().min(0).max(99999).optional(),
    saves: z.number().int().min(0).max(9999).optional(),
    injuryArea: injuryAreaSchema.optional(),
    expectedReturnDate: dateSchema.nullable().optional(),
    leaveStart: dateSchema.nullable().optional(),
    leaveEnd: dateSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "left" || value.leaveStart !== undefined || value.leaveEnd !== undefined) {
      refineLeaveRange(value.leaveStart, value.leaveEnd, ctx);
    }
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

export const playerAccountSchema = z.object({
  email: emailSchema,
  password: z.union([passwordSchema, z.literal("")]).optional(),
});

const statusRemarksSchema = z.string().trim().max(2000, "Remarks are too long.");

/** A player reports an injury or a leave from their own account. */
export const playerStatusReportSchema = z
  .object({
    kind: z.enum(["injury", "leave"]),
    injuryArea: injuryAreaSchema.optional().default(""),
    expectedReturnDate: dateSchema.nullable().optional(),
    remarks: statusRemarksSchema.optional().default(""),
    leaveStart: dateSchema.nullable().optional(),
    leaveEnd: dateSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "injury") {
      if (!value.injuryArea.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Injury Area is required.", path: ["injuryArea"] });
      }
      if (!value.expectedReturnDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected Return Date is required.",
          path: ["expectedReturnDate"],
        });
      }
    }
    if (value.kind === "leave") {
      if (!value.leaveStart || !value.leaveEnd) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Leave Period is required.", path: ["leaveEnd"] });
        return;
      }
      refineLeaveRange(value.leaveStart, value.leaveEnd, ctx);
    }
  });

export const statusNoticeReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export const announcementWriteSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120, "Title is too long."),
  content: z.string().trim().min(1, "Content is required.").max(2000, "Content is too long."),
});

export const announcementReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export const notificationKinds = ["attendance", "event", "other"] as const;
export const notificationVariants = ["default", "success", "danger", "warning"] as const;
/** The notification centre lists toasts from this many days back. */
export const notificationWindowDays = 3;

export const notificationWriteSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional().default(""),
  variant: z.enum(notificationVariants).optional().default("default"),
  kind: z.enum(notificationKinds).optional().default("other"),
  clubId: z.string().min(1).nullable().optional(),
  eventDate: dateSchema.nullable().optional(),
});

const eventNameSchema = z.string().trim().min(1, "Event name is required.").max(120, "Event name is too long.");

export const eventWriteSchema = z.object({
  name: eventNameSchema,
  type: z.enum(eventTypes),
  date: dateSchema,
  startTime: timeSchema,
  location: z.string().trim().min(1, "Location is required.").max(160, "Location is too long."),
  notes: z.string().trim().max(2000, "Notes are too long.").optional().default(""),
  opponent: z.string().trim().max(120, "Opponent is too long.").nullable().optional(),
  scoreFor: z.number().int().min(0).max(99).nullable().optional(),
  scoreAgainst: z.number().int().min(0).max(99).nullable().optional(),
});

export const eventPatchSchema = z
  .object({
    name: eventNameSchema.optional(),
    type: z.enum(eventTypes).optional(),
    date: dateSchema.optional(),
    startTime: timeSchema.optional(),
    location: z.string().trim().min(1, "Location is required.").max(160, "Location is too long.").optional(),
    notes: z.string().trim().max(2000, "Notes are too long.").optional(),
    opponent: z.string().trim().max(120, "Opponent is too long.").nullable().optional(),
    scoreFor: z.number().int().min(0).max(99).nullable().optional(),
    scoreAgainst: z.number().int().min(0).max(99).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

export const playerRsvpSchema = z.object({
  status: z.enum(["present", "absent", "maybe"]),
});

export const managerAttendanceSchema = z.object({
  playerId: z.string().min(1, "Choose a player."),
  status: z.enum(attendanceStatuses),
});

export const transactionWriteSchema = z.object({
  type: z.enum(transactionTypes),
  amount: moneySchema,
  date: dateSchema,
  item: z.string().trim().min(1, "Item is required.").max(80, "Item is too long."),
  notes: z.string().trim().max(2000, "Notes are too long.").optional().default(""),
});

export const adminUserPatchSchema = z.object({
  membershipId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long."),
  email: emailSchema,
  role: z.enum(adminRoles),
  clubId: z.string().min(1, "Club is required."),
});

export const adminClubPatchSchema = z.object({
  name: z.string().trim().min(1, "Club name is required.").max(120, "Club name is too long."),
});

export const clubImportSchema = z
  .object({
    players: z.array(clubImportPlayerSchema).max(csvImportRowLimit, "Too many players.").optional(),
    transactions: z.array(transactionWriteSchema).max(csvImportRowLimit, "Too many transactions.").optional(),
    events: z.array(eventWriteSchema).max(csvImportRowLimit, "Too many events.").optional(),
  })
  .refine(
    (value) => (value.players?.length ?? 0) + (value.transactions?.length ?? 0) + (value.events?.length ?? 0) > 0,
    "Nothing to import.",
  );

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ClubWrite = z.infer<typeof clubWriteSchema>;
export type PlayerWrite = z.infer<typeof playerWriteSchema>;
export type EventWrite = z.infer<typeof eventWriteSchema>;
export type TransactionWrite = z.infer<typeof transactionWriteSchema>;
export type ClubImport = z.infer<typeof clubImportSchema>;
export type PlayerStatus = (typeof playerStatuses)[number];
export type EventType = (typeof eventTypes)[number];
export type MatchResult = (typeof matchResults)[number];
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type NotificationKind = (typeof notificationKinds)[number];
export type NotificationVariant = (typeof notificationVariants)[number];
export type NotificationWrite = z.input<typeof notificationWriteSchema>;

export interface Club {
  id: string;
  name: string;
  description: string;
  goals: string;
  logoUrl: string;
  jerseys: string[];
  attendanceAlertEnabled: boolean;
  attendanceAlertPercent: number | null;
}

export interface Membership {
  clubId: string;
  role: string;
  club: { id: string; name: string; logoUrl: string };
}

export interface ClubSummary {
  id: string;
  name: string;
  logoUrl: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  contact: string;
  isAdmin: boolean;
  clubs: ClubSummary[];
  memberships: Membership[];
}

export interface AdminUserRow {
  id: string;
  userId: string;
  membershipId: string | null;
  name: string;
  role: string;
  email: string;
  clubId: string;
  clubName: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminClubRow {
  id: string;
  name: string;
  createdAt: string;
}

/** Visible membership role. The admin role is shown as Super Admin. */
export function roleLabel(role: string) {
  const trimmed = role.trim();
  if (!trimmed) return "";
  if (trimmed === "admin") return "Super Admin";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

/** Manager pages and manager-only API actions. Super Admin is included. */
export function managesClub(role: string | null | undefined) {
  return role === "manager" || role === "admin";
}

/** Clubs the signed-in person can open. Super Admin can open every club. */
export function accessibleClubIds(user: AuthUser) {
  if (user.isAdmin && user.clubs.length > 0) return user.clubs.map((club) => club.id);
  return user.memberships.map((membership) => membership.clubId);
}

/** Keep a saved club when it is still accessible. Super Admin starts on the Administrator club. */
export function pickClubId(user: AuthUser, preferred?: string | null) {
  const ids = accessibleClubIds(user);
  if (preferred && ids.includes(preferred)) return preferred;
  if (user.isAdmin) {
    const home = user.memberships.find((membership) => membership.role === "admin")?.clubId;
    if (home && ids.includes(home)) return home;
  }
  return ids[0] ?? null;
}

/**
 * Role used for the open club. Super Admin stays a super admin in every club,
 * including clubs where they have no membership.
 */
export function roleForClub(user: AuthUser, clubId: string | null) {
  if (!clubId) return null;
  if (user.isAdmin) return "admin";
  return user.memberships.find((membership) => membership.clubId === clubId)?.role ?? null;
}

/** Two-letter avatar fallback. One word uses its first two letters; more words use the first and last initials. */
export function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Same rate as a player's profile: Yes and Maybe replies over every club event. */
export function attendancePercentage(attended: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((attended / total) * 1000) / 10;
}

/** Warn only when the club has events and the player's rate is under the saved percentage. */
export function shouldWarnAttendance(rate: number, threshold: number, totalEvents: number) {
  return totalEvents > 0 && rate < threshold;
}

export function attendanceAlertMessage(rate: number, threshold: number) {
  return `Your attendance is ${rate}%, which is below the ${threshold}% set by your club.`;
}

export type PasswordChangeFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/** Empty fields are valid. Once any field has a value, the rest are required and the new passwords must match. */
export function passwordChangeFieldErrors(input: PasswordChangeFields): Partial<PasswordChangeFields> {
  const filled = [input.currentPassword, input.newPassword, input.confirmPassword].some((value) => value.length > 0);
  if (!filled) return {};
  const errors: Partial<PasswordChangeFields> = {};
  if (!input.currentPassword) errors.currentPassword = "Current password is required.";
  if (!input.newPassword) errors.newPassword = "New password is required.";
  else {
    const parsed = passwordSchema.safeParse(input.newPassword);
    if (!parsed.success) errors.newPassword = parsed.error.issues[0]?.message ?? "Password is required.";
  }
  if (!input.confirmPassword) errors.confirmPassword = "Confirm password is required.";
  else if (input.newPassword && input.newPassword !== input.confirmPassword) {
    errors.confirmPassword = "New and confirm passwords must match.";
  }
  return errors;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  shirtNumber: number | null;
  contact: string;
  status: PlayerStatus;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  playedMinutes: number;
  saves: number;
  injuryArea: string;
  expectedReturnDate: string | null;
  leaveStart: string | null;
  leaveEnd: string | null;
  userId: string | null;
  accountEmail: string | null;
  /** Last five past sessions, oldest first. Present/Late is "S"; anything else is "A". */
  recentAttendance?: ("S" | "A")[];
}

export interface PlayerDetail extends Player {
  attendanceRate: number;
  savePercentage: number;
}

export interface StatusNotice {
  id: string;
  clubId: string;
  message: string;
  remarks: string;
}

export interface Announcement {
  id: string;
  clubId: string;
  title: string;
  content: string;
}

/** A toast that was shown to the user, kept for the notification centre. */
export interface NotificationItem {
  id: string;
  clubId: string | null;
  title: string;
  description: string;
  variant: NotificationVariant;
  kind: NotificationKind;
  eventDate: string | null;
  createdAt: string;
}

/**
 * Where a notification leads when clicked. Attendance replies open the dashboard attendance tab,
 * event reminders open the calendar on the event day, and everything else stays put (null).
 */
export function notificationHref(
  item: Pick<NotificationItem, "kind" | "eventDate">,
  role: string | null,
): string | null {
  const player = role === "player";
  if (item.kind === "attendance") return player ? "/play?tab=attendance" : "/dashboard";
  if (item.kind === "event" && item.eventDate) {
    return `${player ? "/play/calendar" : "/calendar"}?date=${item.eventDate}`;
  }
  return null;
}

export interface AttendanceMark {
  status: string;
  recordedBy: string | null;
}

export interface ClubEvent {
  id: string;
  name: string;
  type: EventType;
  date: string;
  startTime: string;
  location: string;
  notes: string;
  opponent: string | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  result: MatchResult | null;
  lineup?: MatchLineup | null;
  myAttendance?: AttendanceMark | null;
}

export interface AttendanceRow {
  id: string;
  playerId: string;
  playerName: string;
  shirtNumber: number | null;
  playerStatus: string;
  status: string;
  recordedBy: string | null;
}

export interface MyAttendanceRecord {
  eventId: string;
  type: string;
  date: string;
  startTime: string;
  location: string;
  opponent: string | null;
  status: string;
  recordedBy: string | null;
  repliedAt: string | null;
}

export interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: string;
  date: string;
  item: string;
  notes: string;
}

export interface PlayerStat {
  id: string;
  name: string;
  total: number;
}

export interface Dashboard {
  playerCount: number;
  attendanceRate: number | null;
  attendanceWindowDays: number;
  wins: number;
  losses: number;
  draws: number;
  balance: string;
  income: string;
  expense: string;
  topScorers: PlayerStat[];
  topAssists: PlayerStat[];
  injured: { id: string; name: string; injuryArea: string; expectedReturnDate: string | null }[];
  incoming: ClubEvent[];
  pastResults: ClubEvent[];
  upcoming: ClubEvent[];
}
