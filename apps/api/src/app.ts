import {
  clubPatchSchema,
  clubWriteSchema,
  eventPatchSchema,
  eventTypes,
  eventWriteSchema,
  localISODate,
  loginSchema,
  managerAttendanceSchema,
  canonicalPosition,
  eventHasStarted,
  playerAccountSchema,
  rosterAttendanceMark,
  playerPatchSchema,
  playerRsvpSchema,
  playerWriteSchema,
  registerSchema,
  transactionWriteSchema,
  type PlayerStatus,
} from "@myclub/shared";
import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { prisma } from "./db";
import { isoFromDb, todayUtc, utcDate } from "./dates";
import { HttpError, parseBody } from "./http";
import { hashPassword, verifyPassword } from "./password";
import {
  clubBalance,
  dashboardFor,
  dropFutureUnanswered,
  eventDto,
  normalizeEvent,
  syncEventAttendance,
  syncPlayerAttendance,
  transactionDto,
} from "./rules";
import { readToken, signToken } from "./token";

function queryDate(value: string | undefined) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, "Use a date as YYYY-MM-DD.");
  return utcDate(value);
}

async function readJson(c: Context) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "Expected JSON.");
  }
}

async function authenticate(c: Context) {
  const header = c.req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Sign in required.");
  const payload = readToken(match[1]);
  if (!payload) throw new HttpError(401, "Sign in required.");
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new HttpError(401, "Sign in required.");
  return user;
}

async function requireClub(userId: string, clubId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (!membership) throw new HttpError(403, "You are not a member of this club.");
  if (membership.role !== "manager" && membership.role !== "player") {
    throw new HttpError(403, "You can't do that in this club.");
  }
  return membership;
}

function assertManager(role: string) {
  if (role !== "manager") throw new HttpError(403, "Only a manager can do that.");
}

function clubDto(club: { id: string; name: string; description: string; goals: string; logoUrl: string }) {
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    goals: club.goals,
    logoUrl: club.logoUrl,
  };
}

async function publicUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { clubId: true, role: true, club: { select: { id: true, name: true, logoUrl: true } } },
      },
    },
  });
  return user;
}

function playerJson(player: {
  id: string;
  name: string;
  position: string;
  shirtNumber: number | null;
  contact: string;
  status: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  playedMinutes: number;
  saves: number;
  injuryArea: string;
  expectedReturnDate: Date | null;
  userId: string | null;
  user?: { email: string } | null;
}) {
  return {
    id: player.id,
    name: player.name,
    position: canonicalPosition(player.position),
    shirtNumber: player.shirtNumber,
    contact: player.contact,
    status: player.status as PlayerStatus,
    goals: player.goals,
    assists: player.assists,
    yellowCards: player.yellowCards,
    redCards: player.redCards,
    playedMinutes: player.playedMinutes,
    saves: player.saves,
    injuryArea: player.injuryArea,
    expectedReturnDate: player.expectedReturnDate ? isoFromDb(player.expectedReturnDate) : null,
    userId: player.userId,
    accountEmail: player.user?.email ?? null,
  };
}

async function playerDto(playerId: string) {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    include: { user: { select: { email: true } } },
  });
  return playerJson(player);
}

async function withPlayerAttendance(
  clubId: string,
  userId: string,
  events: Awaited<ReturnType<typeof prisma.event.findMany>>,
) {
  const player = await prisma.player.findFirst({ where: { clubId, userId }, select: { id: true } });
  if (!player) {
    return { playerLinked: false, events: events.map((event) => eventDto(event, null)) };
  }
  const marks = await prisma.attendance.findMany({
    where: { clubId, playerId: player.id, eventId: { in: events.map((event) => event.id) } },
    select: { eventId: true, status: true, recordedBy: true },
  });
  const byEvent = new Map(marks.map((mark) => [mark.eventId, mark]));
  return {
    playerLinked: true,
    events: events.map((event) => {
      const mark = byEvent.get(event.id);
      return eventDto(event, mark ? { status: mark.status, recordedBy: mark.recordedBy } : null);
    }),
  };
}

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong." }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/register", async (c) => {
  const body = parseBody(registerSchema, await readJson(c));
  try {
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
      },
    });
    return c.json({ user: await publicUser(user.id) }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "An account with that email already exists.");
    }
    throw error;
  }
});

app.post("/auth/login", async (c) => {
  const body = parseBody(loginSchema, await readJson(c));
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw new HttpError(401, "User does not exist");
  if (!(await verifyPassword(body.password, user.passwordHash))) {
    throw new HttpError(401, "Incorrect password");
  }
  return c.json({ token: signToken(user.id), user: await publicUser(user.id) });
});

app.get("/auth/me", async (c) => {
  const user = await authenticate(c);
  return c.json({ user: await publicUser(user.id) });
});

app.get("/clubs", async (c) => {
  const user = await authenticate(c);
  const profile = await publicUser(user.id);
  return c.json({ clubs: profile.memberships });
});

app.post("/clubs", async (c) => {
  const user = await authenticate(c);
  const body = parseBody(clubWriteSchema, await readJson(c));
  const club = await prisma.club.create({
    data: {
      name: body.name,
      description: body.description,
      goals: body.goals,
      memberships: { create: { userId: user.id, role: "manager" } },
    },
  });
  return c.json(
    {
      club: clubDto(club),
      user: await publicUser(user.id),
    },
    201,
  );
});

app.get("/clubs/:clubId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  await requireClub(user.id, clubId);
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) throw new HttpError(403, "You are not a member of this club.");
  return c.json({
    club: clubDto(club),
  });
});

app.patch("/clubs/:clubId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = parseBody(clubPatchSchema, await readJson(c));
  const club = await prisma.club.update({ where: { id: clubId }, data: body });
  return c.json({
    club: clubDto(club),
  });
});

app.post("/clubs/:clubId/logo", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image.");
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    throw new HttpError(400, "Use a JPG or PNG image.");
  }
  if (file.size > 1_500_000) throw new HttpError(400, "Image must be 1.5 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const logoUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  if (c.req.query("commit") === "0") return c.json({ logoUrl });
  const club = await prisma.club.update({ where: { id: clubId }, data: { logoUrl } });
  return c.json({ club: clubDto(club) });
});

app.get("/clubs/:clubId/dashboard", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  return c.json(await dashboardFor(clubId));
});

app.get("/clubs/:clubId/players", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const [players, attendanceRows] = await Promise.all([
    prisma.player.findMany({
      where: { clubId },
      include: { user: { select: { email: true } } },
    }),
    prisma.attendance.findMany({
      where: { clubId },
      select: {
        playerId: true,
        status: true,
        event: { select: { date: true, startTime: true } },
      },
    }),
  ]);
  const now = new Date();
  const recentByPlayer = new Map<string, ("S" | "A")[]>();
  const grouped = new Map<string, { stamp: string; mark: "S" | "A" }[]>();
  for (const row of attendanceRows) {
    const date = isoFromDb(row.event.date);
    if (!eventHasStarted(date, row.event.startTime, now)) continue;
    const mark = rosterAttendanceMark(row.status, true);
    if (!mark) continue;
    const list = grouped.get(row.playerId) ?? [];
    list.push({ stamp: `${date}T${row.event.startTime}`, mark });
    grouped.set(row.playerId, list);
  }
  for (const [playerId, list] of grouped) {
    list.sort((a, b) => b.stamp.localeCompare(a.stamp));
    recentByPlayer.set(
      playerId,
      list.slice(0, 5).reverse().map((item) => item.mark),
    );
  }
  players.sort((a, b) => {
    if (a.shirtNumber == null && b.shirtNumber != null) return 1;
    if (a.shirtNumber != null && b.shirtNumber == null) return -1;
    if (a.shirtNumber != null && b.shirtNumber != null && a.shirtNumber !== b.shirtNumber) {
      return a.shirtNumber - b.shirtNumber;
    }
    return a.name.localeCompare(b.name);
  });
  return c.json({
    players: players.map((player) => ({
      ...playerJson(player),
      recentAttendance: recentByPlayer.get(player.id) ?? [],
    })),
  });
});

app.get("/clubs/:clubId/players/:playerId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const player = await prisma.player.findFirst({
    where: { id: c.req.param("playerId"), clubId },
    include: { user: { select: { email: true } } },
  });
  if (!player) throw new HttpError(404, "Player not found.");

  const [totalEvents, yesMaybeCount, lostScoresAgg] = await Promise.all([
    prisma.event.count({ where: { clubId } }),
    prisma.attendance.count({
      where: {
        clubId,
        playerId: player.id,
        status: { in: ["present", "maybe"] },
      },
    }),
    prisma.event.aggregate({
      where: { clubId, type: "match", scoreAgainst: { not: null } },
      _sum: { scoreAgainst: true },
    }),
  ]);

  const attendanceRate = totalEvents === 0 ? 0 : Math.round((yesMaybeCount / totalEvents) * 1000) / 10;
  const lostScore = lostScoresAgg._sum.scoreAgainst ?? 0;
  const saveDenom = player.saves + lostScore;
  const savePercentage = saveDenom === 0 ? 0 : Math.round((player.saves / saveDenom) * 1000) / 10;

  return c.json({
    player: {
      ...playerJson(player),
      attendanceRate,
      savePercentage,
    },
  });
});

app.post("/clubs/:clubId/players", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = parseBody(playerWriteSchema, await readJson(c));
  const injured = body.status === "injured";
  const player = await prisma.player.create({
    data: {
      clubId,
      name: body.name,
      position: body.position,
      shirtNumber: body.shirtNumber ?? null,
      contact: body.contact,
      status: body.status,
      goals: body.goals,
      assists: body.assists,
      yellowCards: body.yellowCards,
      redCards: body.redCards,
      playedMinutes: body.playedMinutes,
      saves: body.saves,
      injuryArea: injured ? body.injuryArea : "",
      expectedReturnDate: injured && body.expectedReturnDate ? utcDate(body.expectedReturnDate) : null,
    },
  });
  if (player.status !== "left") await syncPlayerAttendance(player.id, clubId);
  return c.json({ player: await playerDto(player.id) }, 201);
});

app.patch("/clubs/:clubId/players/:playerId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const existing = await prisma.player.findFirst({
    where: { id: c.req.param("playerId"), clubId },
  });
  if (!existing) throw new HttpError(404, "Player not found.");
  const body = parseBody(playerPatchSchema, await readJson(c));
  const status = body.status ?? existing.status;
  const injured = status === "injured";
  const injuryArea = injured ? (body.injuryArea ?? existing.injuryArea).trim() : "";
  if (injured && !injuryArea) throw new HttpError(400, "Injury Area is required.");
  const expectedReturnDate = !injured
    ? null
    : body.expectedReturnDate === undefined
      ? existing.expectedReturnDate
      : body.expectedReturnDate
        ? utcDate(body.expectedReturnDate)
        : null;
  const player = await prisma.player.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.shirtNumber !== undefined ? { shirtNumber: body.shirtNumber } : {}),
      ...(body.contact !== undefined ? { contact: body.contact } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.goals !== undefined ? { goals: body.goals } : {}),
      ...(body.assists !== undefined ? { assists: body.assists } : {}),
      ...(body.yellowCards !== undefined ? { yellowCards: body.yellowCards } : {}),
      ...(body.redCards !== undefined ? { redCards: body.redCards } : {}),
      ...(body.playedMinutes !== undefined ? { playedMinutes: body.playedMinutes } : {}),
      ...(body.saves !== undefined ? { saves: body.saves } : {}),
      injuryArea,
      expectedReturnDate,
    },
  });
  if (player.status === "left") await dropFutureUnanswered(player.id);
  else await syncPlayerAttendance(player.id, clubId);
  return c.json({ player: await playerDto(player.id) });
});

app.delete("/clubs/:clubId/players/:playerId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const existing = await prisma.player.findFirst({
    where: { id: c.req.param("playerId"), clubId },
  });
  if (!existing) throw new HttpError(404, "Player not found.");
  await prisma.player.delete({ where: { id: existing.id } });
  return c.json({ ok: true });
});

app.post("/clubs/:clubId/players/:playerId/account", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const player = await prisma.player.findFirst({
    where: { id: c.req.param("playerId"), clubId },
  });
  if (!player) throw new HttpError(404, "Player not found.");
  const body = parseBody(playerAccountSchema, await readJson(c));
  const password = body.password || undefined;
  const existing = await prisma.user.findUnique({ where: { email: body.email } });

  if (player.userId && (!existing || player.userId !== existing.id)) {
    throw new HttpError(409, "This player is already linked to another account.");
  }

  if (existing) {
    const member = await prisma.membership.findUnique({
      where: { userId_clubId: { userId: existing.id, clubId } },
    });
    if (member && member.role !== "player") {
      throw new HttpError(409, "That email already belongs to a manager of this club.");
    }
    const otherPlayer = await prisma.player.findFirst({
      where: { clubId, userId: existing.id, NOT: { id: player.id } },
    });
    if (otherPlayer) throw new HttpError(409, "That account is already linked to another player.");
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: player.id }, data: { userId: existing.id } });
      if (!member) {
        await tx.membership.create({ data: { userId: existing.id, clubId, role: "player" } });
      }
    });
    return c.json({ player: await playerDto(player.id), linkedExisting: true });
  }

  if (!password) throw new HttpError(400, "Password is required for a new account.");
  await prisma.user.create({
    data: {
      email: body.email,
      name: player.name,
      passwordHash: await hashPassword(password),
      memberships: { create: { clubId, role: "player" } },
      players: { connect: { id: player.id } },
    },
  });
  return c.json({ player: await playerDto(player.id), linkedExisting: false }, 201);
});

app.get("/clubs/:clubId/events", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  const from = queryDate(c.req.query("from"));
  const to = queryDate(c.req.query("to"));
  const upcoming = c.req.query("upcoming") === "1";
  const finished = c.req.query("finished") === "1";
  const type = c.req.query("type");
  const today = todayUtc();

  const events = await prisma.event.findMany({
    where: {
      clubId,
      ...(typeof type === "string" && (eventTypes as readonly string[]).includes(type) ? { type } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(upcoming
        ? {
            date: { gte: today },
            OR: [{ type: { in: ["training", "leisure", "friendly"] } }, { type: "match", result: null }],
          }
        : {}),
      ...(finished ? { type: "match", result: { not: null } } : {}),
    },
    orderBy: upcoming
      ? [{ date: "asc" }, { startTime: "asc" }]
      : [{ date: "desc" }, { startTime: "desc" }],
    take: 500,
  });

  if (membership.role === "player") {
    return c.json(await withPlayerAttendance(clubId, user.id, events));
  }
  return c.json({ events: events.map((event) => eventDto(event)) });
});

app.post("/clubs/:clubId/events", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = parseBody(eventWriteSchema, await readJson(c));
  const normalized = normalizeEvent({
    type: body.type,
    opponent: body.opponent ?? null,
    scoreFor: body.scoreFor ?? null,
    scoreAgainst: body.scoreAgainst ?? null,
    result: null,
  });
  const event = await prisma.event.create({
    data: {
      clubId,
      type: normalized.type,
      name: body.name,
      date: utcDate(body.date),
      startTime: body.startTime,
      location: body.location,
      notes: body.notes,
      opponent: normalized.opponent,
      scoreFor: normalized.scoreFor,
      scoreAgainst: normalized.scoreAgainst,
      result: normalized.result,
    },
  });
  await syncEventAttendance(event.id, clubId);
  return c.json({ event: eventDto(event) }, 201);
});

app.patch("/clubs/:clubId/events/:eventId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const existing = await prisma.event.findFirst({
    where: { id: c.req.param("eventId"), clubId },
  });
  if (!existing) throw new HttpError(404, "Event not found.");
  const body = parseBody(eventPatchSchema, await readJson(c));
  const normalized = normalizeEvent({
    type: body.type ?? existing.type,
    opponent: body.opponent !== undefined ? body.opponent : existing.opponent,
    scoreFor: body.scoreFor !== undefined ? body.scoreFor : existing.scoreFor,
    scoreAgainst: body.scoreAgainst !== undefined ? body.scoreAgainst : existing.scoreAgainst,
    result: existing.result,
  });
  const event = await prisma.event.update({
    where: { id: existing.id },
    data: {
      type: normalized.type,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.date ? { date: utcDate(body.date) } : {}),
      ...(body.startTime ? { startTime: body.startTime } : {}),
      ...(body.location ? { location: body.location } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      opponent: normalized.opponent,
      scoreFor: normalized.scoreFor,
      scoreAgainst: normalized.scoreAgainst,
      result: normalized.result,
    },
  });
  await syncEventAttendance(event.id, clubId);
  return c.json({ event: eventDto(event) });
});

app.get("/clubs/:clubId/events/:eventId/attendance", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  const event = await prisma.event.findFirst({
    where: { id: c.req.param("eventId"), clubId },
  });
  if (!event) throw new HttpError(404, "Event not found.");
  await syncEventAttendance(event.id, clubId);

  if (membership.role === "player") {
    const player = await prisma.player.findFirst({ where: { clubId, userId: user.id } });
    if (!player) return c.json({ attendance: null, playerLinked: false });
    const row = await prisma.attendance.findUnique({
      where: { playerId_eventId: { playerId: player.id, eventId: event.id } },
    });
    return c.json({
      playerLinked: true,
      attendance: row
        ? { id: row.id, playerId: player.id, status: row.status, recordedBy: row.recordedBy }
        : null,
    });
  }

  if (membership.role !== "manager") throw new HttpError(403, "Only a manager can do that.");

  const rows = await prisma.attendance.findMany({
    where: { eventId: event.id, clubId },
    include: { player: { select: { name: true, shirtNumber: true, status: true } } },
  });
  rows.sort((a, b) => a.player.name.localeCompare(b.player.name));
  return c.json({
    attendance: rows.map((row) => ({
      id: row.id,
      playerId: row.playerId,
      playerName: row.player.name,
      shirtNumber: row.player.shirtNumber,
      playerStatus: row.player.status,
      status: row.status,
      recordedBy: row.recordedBy,
    })),
  });
});

app.put("/clubs/:clubId/events/:eventId/attendance", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  const event = await prisma.event.findFirst({
    where: { id: c.req.param("eventId"), clubId },
  });
  if (!event) throw new HttpError(404, "Event not found.");
  const raw = await readJson(c);

  if (membership.role === "player") {
    if (raw && typeof raw === "object" && "playerId" in raw) {
      throw new HttpError(403, "Players can only reply for themselves.");
    }
    const body = parseBody(playerRsvpSchema, raw);
    const player = await prisma.player.findFirst({ where: { clubId, userId: user.id } });
    if (!player) throw new HttpError(400, "Your account is not linked to a roster profile.");
    if (player.status === "left") throw new HttpError(403, "Left players cannot reply.");
    const row = await prisma.attendance.upsert({
      where: { playerId_eventId: { playerId: player.id, eventId: event.id } },
      create: {
        clubId,
        playerId: player.id,
        eventId: event.id,
        status: body.status,
        recordedBy: "player",
        recordedByUserId: user.id,
      },
      update: { status: body.status, recordedBy: "player", recordedByUserId: user.id },
    });
    return c.json({
      attendance: { id: row.id, playerId: player.id, status: row.status, recordedBy: row.recordedBy },
    });
  }

  assertManager(membership.role);
  const body = parseBody(managerAttendanceSchema, raw);
  const player = await prisma.player.findFirst({ where: { id: body.playerId, clubId } });
  if (!player) throw new HttpError(404, "Player not found.");
  const recordedBy = body.status === "unanswered" ? null : "manager";
  const row = await prisma.attendance.upsert({
    where: { playerId_eventId: { playerId: player.id, eventId: event.id } },
    create: {
      clubId,
      playerId: player.id,
      eventId: event.id,
      status: body.status,
      recordedBy,
      recordedByUserId: recordedBy ? user.id : null,
    },
    update: {
      status: body.status,
      recordedBy,
      recordedByUserId: recordedBy ? user.id : null,
    },
  });
  return c.json({
    attendance: {
      id: row.id,
      playerId: player.id,
      playerName: player.name,
      shirtNumber: player.shirtNumber,
      status: row.status,
      recordedBy: row.recordedBy,
    },
  });
});

app.get("/clubs/:clubId/me/attendance", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  if (membership.role !== "player") throw new HttpError(403, "Only a player can do that.");
  const player = await prisma.player.findFirst({ where: { clubId, userId: user.id } });
  if (!player) return c.json({ records: [] });
  const today = localISODate();
  const rows = await prisma.attendance.findMany({
    where: { playerId: player.id, clubId },
    include: { event: true },
    orderBy: { event: { date: "desc" } },
  });
  return c.json({
    records: rows
      .filter((row) => isoFromDb(row.event.date) < today)
      .map((row) => ({
        eventId: row.eventId,
        type: row.event.type,
        date: isoFromDb(row.event.date),
        startTime: row.event.startTime,
        location: row.event.location,
        opponent: row.event.opponent,
        status: row.status,
        recordedBy: row.recordedBy,
        repliedAt: row.recordedBy ? row.updatedAt.toISOString() : null,
      })),
  });
});

app.get("/clubs/:clubId/transactions", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const [rows, balance] = await Promise.all([
    prisma.transaction.findMany({
      where: { clubId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    clubBalance(clubId),
  ]);
  return c.json({ balance, transactions: rows.map(transactionDto) });
});

app.post("/clubs/:clubId/transactions", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = parseBody(transactionWriteSchema, await readJson(c));
  const row = await prisma.transaction.create({
    data: {
      clubId,
      type: body.type,
      amount: body.amount.toFixed(2),
      date: utcDate(body.date),
      item: body.item,
      notes: body.notes,
    },
  });
  return c.json({ transaction: transactionDto(row), balance: await clubBalance(clubId) }, 201);
});

app.patch("/clubs/:clubId/transactions/:transactionId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const existing = await prisma.transaction.findFirst({
    where: { id: c.req.param("transactionId"), clubId },
  });
  if (!existing) throw new HttpError(404, "Transaction not found.");
  const body = parseBody(transactionWriteSchema, await readJson(c));
  const row = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      type: body.type,
      amount: body.amount.toFixed(2),
      date: utcDate(body.date),
      item: body.item,
      notes: body.notes,
    },
  });
  return c.json({ transaction: transactionDto(row), balance: await clubBalance(clubId) });
});

app.delete("/clubs/:clubId/transactions/:transactionId", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const existing = await prisma.transaction.findFirst({
    where: { id: c.req.param("transactionId"), clubId },
  });
  if (!existing) throw new HttpError(404, "Transaction not found.");
  await prisma.transaction.delete({ where: { id: existing.id } });
  return c.json({ ok: true, balance: await clubBalance(clubId) });
});
