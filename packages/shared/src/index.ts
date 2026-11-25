import { z } from "zod";

import { formatDayMonth } from "./dates";
import { jerseyDataUrlSchema, type MatchLineup } from "./lineup";

export * from "./dates";
export * from "./lineup";

export const playerStatuses = ["active", "injured", "left"] as const;
export const playerPositions = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;

const positionAliases: Record<string, (typeof playerPositions)[number]> = {
  gk: "Goalkeeper",
  goalkeeper: "Goalkeeper",
  goalie: "Goalkeeper",
  keeper: "Goalkeeper",
  def: "Defender",
  defender: "Defender",
  defence: "Defender",
  defense: "Defender",
  mid: "Midfielder",
  midfield: "Midfielder",
  midfielder: "Midfielder",
  fwd: "Forward",
  forward: "Forward",
  striker: "Forward",
};

/** Map a stored position onto the roster dropdown. Unknown text is left unchanged. */
export function canonicalPosition(value: string) {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  return positionAliases[key] ?? value.trim();
}
export const eventTypes = ["training", "match", "leisure", "friendly"] as const;

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

export function eventTypeLabel(type: string) {
  switch (type) {
    case "match":
      return "Match";
    case "friendly":
      return "Friendly";
    case "leisure":
      return "Leisure";
    case "training":
      return "Training";
    default:
      return type;
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

export const clubPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Club name is required.").max(120, "Club name is too long.").optional(),
    description: z.string().trim().max(4000, "Description is too long.").optional(),
    goals: z.string().trim().max(4000, "Goals are too long.").optional(),
    logoUrl: clubLogoSchema.optional(),
    jerseys: z.array(jerseyDataUrlSchema).max(12, "Too many jerseys.").optional(),
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
export const notificationVariants = ["default", "success", "danger"] as const;
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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ClubWrite = z.infer<typeof clubWriteSchema>;
export type PlayerWrite = z.infer<typeof playerWriteSchema>;
export type EventWrite = z.infer<typeof eventWriteSchema>;
export type TransactionWrite = z.infer<typeof transactionWriteSchema>;
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
}

export interface Membership {
  clubId: string;
  role: string;
  club: { id: string; name: string; logoUrl: string };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  memberships: Membership[];
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
