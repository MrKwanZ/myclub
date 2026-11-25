import {
  addDays,
  eventTypeLabel,
  lineupWriteSchema,
  localISODate,
  resultFromScores,
  type EventType,
  type MatchLineup,
} from "@myclub/shared";
import type { Event } from "@prisma/client";
import { prisma } from "./db";
import { isoFromDb, moneyToString, todayUtc, utcDate } from "./dates";
import { HttpError } from "./http";

type EventShape = {
  type: string;
  opponent: string | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  result: string | null;
};

/** Match scores decide the result. A match needs an opponent. Training, leisure, and friendlies do not carry a result. */
export function normalizeEvent(input: EventShape): EventShape {
  if (input.type === "training" || input.type === "leisure" || input.type === "friendly") {
    const scored = input.scoreFor != null || input.scoreAgainst != null || input.result != null;
    if (input.type === "friendly") {
      if (scored) throw new HttpError(400, "A friendly does not have a score or result.");
      return {
        ...input,
        opponent: input.opponent?.trim() || null,
        scoreFor: null,
        scoreAgainst: null,
        result: null,
      };
    }
    if (input.opponent || scored) {
      throw new HttpError(400, `${eventTypeLabel(input.type)} does not have an opponent, score, or result.`);
    }
    return { ...input, opponent: null, scoreFor: null, scoreAgainst: null, result: null };
  }

  if (input.type !== "match") throw new HttpError(400, "Event type must be training, match, leisure, or friendly.");

  const opponent = input.opponent?.trim() ?? "";
  if (!opponent) throw new HttpError(400, "Enter the opponent.");

  const started = input.scoreFor != null || input.scoreAgainst != null || input.result != null;
  if (!started) {
    return { ...input, opponent, scoreFor: null, scoreAgainst: null, result: null };
  }
  if (input.scoreFor == null || input.scoreAgainst == null) {
    throw new HttpError(400, "Enter both scores.");
  }
  const result = resultFromScores(input.scoreFor, input.scoreAgainst);
  return { ...input, opponent, result };
}

export async function syncEventAttendance(eventId: string, clubId: string) {
  const players = await prisma.player.findMany({
    where: { clubId, status: { in: ["active", "injured"] } },
    select: { id: true },
  });
  if (players.length === 0) return;
  await prisma.attendance.createMany({
    data: players.map((player) => ({
      clubId,
      playerId: player.id,
      eventId,
      status: "unanswered",
    })),
    skipDuplicates: true,
  });
}

export async function syncPlayerAttendance(playerId: string, clubId: string) {
  const events = await prisma.event.findMany({
    where: { clubId, date: { gte: todayUtc() } },
    select: { id: true },
  });
  if (events.length === 0) return;
  await prisma.attendance.createMany({
    data: events.map((event) => ({
      clubId,
      playerId,
      eventId: event.id,
      status: "unanswered",
    })),
    skipDuplicates: true,
  });
}

export async function dropFutureUnanswered(playerId: string) {
  await prisma.attendance.deleteMany({
    where: {
      playerId,
      status: "unanswered",
      event: { date: { gte: todayUtc() } },
    },
  });
}

export async function clubBalance(clubId: string) {
  const rows = await prisma.transaction.findMany({
    where: { clubId },
    select: { type: true, amount: true },
  });
  let cents = 0;
  for (const row of rows) {
    const amount = Math.round(Number(row.amount.toString()) * 100);
    cents += row.type === "income" ? amount : -amount;
  }
  return (cents / 100).toFixed(2);
}

export async function dashboardFor(clubId: string) {
  const today = localISODate();
  const from = utcDate(addDays(today, -29));
  const todayDate = utcDate(today);

  const [playerCount, attendanceRows, results, balance, upcoming, transactions, scorers, assists, injured, pastResults] =
    await Promise.all([
    prisma.player.count({ where: { clubId, status: { not: "left" } } }),
    prisma.attendance.findMany({
      where: {
        status: { in: ["present", "absent", "maybe", "late"] },
        event: { clubId, date: { gte: from, lte: todayDate } },
      },
      select: { status: true },
    }),
    prisma.event.groupBy({
      by: ["result"],
      where: { clubId, type: "match", result: { not: null } },
      _count: { _all: true },
    }),
    clubBalance(clubId),
    prisma.event.findMany({
      where: {
        clubId,
        date: { gte: todayDate },
        OR: [{ type: { in: ["training", "leisure", "friendly"] } }, { type: "match", result: null }],
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 8,
    }),
    prisma.transaction.findMany({ where: { clubId }, select: { type: true, amount: true } }),
    prisma.player.findMany({
      where: { clubId, status: { not: "left" }, goals: { gt: 0 } },
      orderBy: [{ goals: "desc" }, { name: "asc" }],
      take: 3,
      select: { id: true, name: true, goals: true },
    }),
    prisma.player.findMany({
      where: { clubId, status: { not: "left" }, assists: { gt: 0 } },
      orderBy: [{ assists: "desc" }, { name: "asc" }],
      take: 3,
      select: { id: true, name: true, assists: true },
    }),
    prisma.player.findMany({
      where: { clubId, status: "injured" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, injuryArea: true, expectedReturnDate: true },
    }),
    prisma.event.findMany({
      where: { clubId, type: "match", result: { not: null } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 8,
    }),
  ]);

  const attended = attendanceRows.filter((row) => row.status === "present" || row.status === "late").length;
  const attendanceRate =
    attendanceRows.length === 0 ? null : Math.round((attended / attendanceRows.length) * 1000) / 10;

  const count = (result: string) => results.find((row) => row.result === result)?._count._all ?? 0;
  let incomeCents = 0;
  let expenseCents = 0;
  for (const row of transactions) {
    const cents = Math.round(Number(row.amount.toString()) * 100);
    if (row.type === "income") incomeCents += cents;
    else expenseCents += cents;
  }
  const money = (cents: number) => (cents / 100).toFixed(2);

  return {
    playerCount,
    attendanceRate,
    attendanceWindowDays: 30,
    wins: count("win"),
    losses: count("loss"),
    draws: count("draw"),
    balance,
    income: money(incomeCents),
    expense: money(expenseCents),
    topScorers: scorers.map((player) => ({ id: player.id, name: player.name, total: player.goals })),
    topAssists: assists.map((player) => ({ id: player.id, name: player.name, total: player.assists })),
    injured: injured.map((player) => ({
      id: player.id,
      name: player.name,
      injuryArea: player.injuryArea,
      expectedReturnDate: player.expectedReturnDate ? isoFromDb(player.expectedReturnDate) : null,
    })),
    incoming: upcoming.filter((event) => event.type === "match").map((event) => eventDto(event)),
    pastResults: pastResults.map((event) => eventDto(event)),
    upcoming: upcoming.map((event) => eventDto(event)),
  };
}

function parseStoredLineup(raw: unknown): MatchLineup | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = lineupWriteSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    jerseyUrl: parsed.data.jerseyUrl ?? null,
    players: parsed.data.players,
  };
}

export function eventDto(event: Event, myAttendance?: { status: string; recordedBy: string | null } | null) {
  return {
    id: event.id,
    name: event.name,
    type: event.type as EventType,
    date: isoFromDb(event.date),
    startTime: event.startTime,
    location: event.location,
    notes: event.notes,
    opponent: event.opponent,
    scoreFor: event.scoreFor,
    scoreAgainst: event.scoreAgainst,
    result: event.result as "win" | "loss" | "draw" | null,
    lineup: parseStoredLineup(event.lineup),
    ...(myAttendance !== undefined ? { myAttendance } : {}),
  };
}

export function transactionDto(row: {
  id: string;
  type: string;
  amount: { toFixed(digits: number): string };
  date: Date;
  item: string;
  notes: string;
}) {
  return {
    id: row.id,
    type: row.type as "income" | "expense",
    amount: moneyToString(row.amount),
    date: isoFromDb(row.date),
    item: row.item,
    notes: row.notes,
  };
}
