import {
  adminClubPatchSchema,
  adminUserPatchSchema,
  type AdminUserRow,
  announcementReadSchema,
  announcementWriteSchema,
  compareClubName,
  managesClub,
  clubImportSchema,
  clubPatchSchema,
  clubWriteSchema,
  eventPatchSchema,
  eventTypes,
  eventWriteSchema,
  lineupWriteSchema,
  localISODate,
  attendanceAlertMessage,
  attendancePercentage,
  loginSchema,
  managerAttendanceSchema,
  notificationWindowDays,
  notificationWriteSchema,
  canonicalPosition,
  eventHasStarted,
  playerAccountSchema,
  rosterAttendanceMark,
  injuryStatusMessage,
  leaveStatusMessage,
  playerPatchSchema,
  playerRsvpSchema,
  playerStatusReportSchema,
  passwordChangeSchema,
  playerWriteSchema,
  profilePatchSchema,
  registerSchema,
  shouldWarnAttendance,
  statusNoticeReadSchema,
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
  const admin = await prisma.membership.findFirst({ where: { userId, role: "admin" } });
  if (admin) {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new HttpError(404, "Club not found.");
    return { ...admin, clubId, role: "admin" };
  }
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
  if (!managesClub(role)) throw new HttpError(403, "Only a manager can do that.");
}

async function requireAdmin(userId: string) {
  const membership = await prisma.membership.findFirst({ where: { userId, role: "admin" } });
  if (!membership) throw new HttpError(403, "Only an administrator can do that.");
  return membership;
}

function clubDto(club: {
  id: string;
  name: string;
  description: string;
  goals: string;
  logoUrl: string;
  jerseys?: string[];
  attendanceAlertEnabled: boolean;
  attendanceAlertPercent: number | null;
}) {
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    goals: club.goals,
    logoUrl: club.logoUrl,
    jerseys: club.jerseys ?? [],
    attendanceAlertEnabled: club.attendanceAlertEnabled,
    attendanceAlertPercent: club.attendanceAlertPercent,
  };
}

async function publicUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      contact: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { clubId: true, role: true, club: { select: { id: true, name: true, logoUrl: true } } },
      },
    },
  });
  const isAdmin = user.memberships.some((membership) => membership.role === "admin");
  const clubs = isAdmin
    ? (
        await prisma.club.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      ).map((club) => ({ ...club, logoUrl: "" }))
    : user.memberships.map((membership) => membership.club);
  return { ...user, isAdmin, clubs };
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
  leaveStart: Date | null;
  leaveEnd: Date | null;
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
    leaveStart: player.leaveStart ? isoFromDb(player.leaveStart) : null,
    leaveEnd: player.leaveEnd ? isoFromDb(player.leaveEnd) : null,
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
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return c.json({ token: signToken(user.id), user: await publicUser(user.id) });
});

app.get("/auth/me", async (c) => {
  const user = await authenticate(c);
  return c.json({ user: await publicUser(user.id) });
});

app.patch("/auth/me", async (c) => {
  const user = await authenticate(c);
  const body = parseBody(profilePatchSchema, await readJson(c));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name,
      contact: body.contact,
      ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
    },
  });
  return c.json({ user: await publicUser(user.id) });
});

app.post("/auth/password", async (c) => {
  const user = await authenticate(c);
  const body = parseBody(passwordChangeSchema, await readJson(c));
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    throw new HttpError(401, "Incorrect password");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });
  return c.json({ ok: true });
});

app.post("/auth/avatar", async (c) => {
  const user = await authenticate(c);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image.");
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    throw new HttpError(400, "Use a JPG or PNG image.");
  }
  if (file.size > 1_500_000) throw new HttpError(400, "Image must be 1.5 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const avatarUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  if (c.req.query("commit") === "0") return c.json({ avatarUrl });
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
  return c.json({ user: await publicUser(user.id), avatarUrl });
});

app.get("/me/attendance-alerts", async (c) => {
  const user = await authenticate(c);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, role: "player" },
    select: { clubId: true },
  });
  const alerts: { clubId: string; message: string }[] = [];
  for (const membership of memberships) {
    const club = await prisma.club.findUnique({
      where: { id: membership.clubId },
      select: { attendanceAlertEnabled: true, attendanceAlertPercent: true },
    });
    if (!club?.attendanceAlertEnabled || club.attendanceAlertPercent == null) continue;
    const player = await prisma.player.findFirst({
      where: { clubId: membership.clubId, userId: user.id },
      select: { id: true },
    });
    if (!player) continue;
    const [totalEvents, attended] = await Promise.all([
      prisma.event.count({ where: { clubId: membership.clubId } }),
      prisma.attendance.count({
        where: {
          clubId: membership.clubId,
          playerId: player.id,
          status: { in: ["present", "maybe"] },
        },
      }),
    ]);
    const rate = attendancePercentage(attended, totalEvents);
    if (!shouldWarnAttendance(rate, club.attendanceAlertPercent, totalEvents)) continue;
    alerts.push({
      clubId: membership.clubId,
      message: attendanceAlertMessage(rate, club.attendanceAlertPercent),
    });
  }
  return c.json({ alerts });
});

app.get("/me/status-notices", async (c) => {
  const user = await authenticate(c);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, role: "manager" },
    select: { clubId: true },
  });
  const clubIds = memberships.map((membership) => membership.clubId);
  if (clubIds.length === 0) return c.json({ notices: [] });
  const notices = await prisma.statusNotice.findMany({
    where: { clubId: { in: clubIds }, reads: { none: { userId: user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, clubId: true, message: true, remarks: true },
  });
  return c.json({ notices });
});

app.post("/me/status-notices/read", async (c) => {
  const user = await authenticate(c);
  const body = parseBody(statusNoticeReadSchema, await readJson(c));
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, role: "manager" },
    select: { clubId: true },
  });
  const clubIds = memberships.map((membership) => membership.clubId);
  if (clubIds.length === 0) return c.json({ ok: true });
  const notices = await prisma.statusNotice.findMany({
    where: { id: { in: body.ids }, clubId: { in: clubIds } },
    select: { id: true },
  });
  if (notices.length > 0) {
    await prisma.statusNoticeRead.createMany({
      data: notices.map((notice) => ({ noticeId: notice.id, userId: user.id })),
      skipDuplicates: true,
    });
  }
  return c.json({ ok: true });
});

function notificationDto(row: {
  id: string;
  clubId: string | null;
  title: string;
  description: string;
  variant: string;
  kind: string;
  eventDate: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    clubId: row.clubId,
    title: row.title,
    description: row.description,
    variant: row.variant,
    kind: row.kind,
    eventDate: row.eventDate ? isoFromDb(row.eventDate) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

app.get("/me/notifications", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.query("clubId");
  const since = new Date(Date.now() - notificationWindowDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.notification.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: since },
      ...(clubId ? { OR: [{ clubId }, { clubId: null }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ notifications: rows.map(notificationDto) });
});

app.post("/me/notifications", async (c) => {
  const user = await authenticate(c);
  const body = parseBody(notificationWriteSchema, await readJson(c));
  const clubId = body.clubId ?? null;
  if (clubId) await requireClub(user.id, clubId);
  const row = await prisma.notification.create({
    data: {
      userId: user.id,
      clubId,
      title: body.title,
      description: body.description,
      variant: body.variant,
      kind: body.kind,
      eventDate: body.eventDate ? utcDate(body.eventDate) : null,
    },
  });
  return c.json({ notification: notificationDto(row) }, 201);
});

app.get("/me/announcements", async (c) => {
  const user = await authenticate(c);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { clubId: true },
  });
  const clubIds = memberships.map((membership) => membership.clubId);
  if (clubIds.length === 0) return c.json({ announcements: [] });
  const announcements = await prisma.announcement.findMany({
    where: { clubId: { in: clubIds }, reads: { none: { userId: user.id } } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, clubId: true, title: true, content: true },
  });
  return c.json({ announcements });
});

app.post("/me/announcements/read", async (c) => {
  const user = await authenticate(c);
  const body = parseBody(announcementReadSchema, await readJson(c));
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { clubId: true },
  });
  const clubIds = memberships.map((membership) => membership.clubId);
  if (clubIds.length === 0) return c.json({ ok: true });
  const announcements = await prisma.announcement.findMany({
    where: { id: { in: body.ids }, clubId: { in: clubIds } },
    select: { id: true },
  });
  if (announcements.length > 0) {
    await prisma.announcementRead.createMany({
      data: announcements.map((announcement) => ({ announcementId: announcement.id, userId: user.id })),
      skipDuplicates: true,
    });
  }
  return c.json({ ok: true });
});

app.post("/clubs/:clubId/announcements", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = parseBody(announcementWriteSchema, await readJson(c));
  const announcement = await prisma.announcement.create({
    data: {
      clubId,
      authorId: user.id,
      title: body.title,
      content: body.content,
      reads: { create: { userId: user.id } },
    },
  });
  return c.json(
    {
      announcement: {
        id: announcement.id,
        clubId: announcement.clubId,
        title: announcement.title,
        content: announcement.content,
      },
    },
    201,
  );
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

app.post("/clubs/:clubId/import", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const body = parseBody(clubImportSchema, await readJson(c));
  const imported = await prisma.$transaction(async (tx) => {
    const players = body.players ?? [];
    const transactions = body.transactions ?? [];
    const events = (body.events ?? []).map((event) => {
      const normalized = normalizeEvent({
        type: event.type,
        opponent: event.opponent ?? null,
        scoreFor: event.scoreFor ?? null,
        scoreAgainst: event.scoreAgainst ?? null,
        result: null,
      });
      return {
        clubId,
        type: normalized.type,
        name: event.name,
        date: utcDate(event.date),
        startTime: event.startTime,
        location: event.location,
        notes: event.notes,
        opponent: normalized.opponent,
        scoreFor: normalized.scoreFor,
        scoreAgainst: normalized.scoreAgainst,
        result: normalized.result,
      };
    });

    if (players.length > 0) {
      await tx.player.createMany({
        data: players.map((player) => ({
          clubId,
          name: player.name,
          position: player.position,
          shirtNumber: player.shirtNumber ?? null,
          contact: player.contact,
          status: player.status,
          goals: player.goals,
          assists: player.assists,
          yellowCards: player.yellowCards,
          redCards: player.redCards,
          playedMinutes: player.playedMinutes,
          saves: player.saves,
        })),
      });
    }
    if (events.length > 0) await tx.event.createMany({ data: events });
    if (transactions.length > 0) {
      await tx.transaction.createMany({
        data: transactions.map((row) => ({
          clubId,
          type: row.type,
          amount: row.amount.toFixed(2),
          date: utcDate(row.date),
          item: row.item,
          notes: row.notes,
        })),
      });
    }

    const [activePlayers, clubEvents] = await Promise.all([
      tx.player.findMany({
        where: { clubId, status: { in: ["active", "injured"] } },
        select: { id: true },
      }),
      tx.event.findMany({ where: { clubId }, select: { id: true } }),
    ]);
    const attendance = activePlayers.flatMap((player) =>
      clubEvents.map((event) => ({
        clubId,
        playerId: player.id,
        eventId: event.id,
        status: "unanswered",
      })),
    );
    for (let index = 0; index < attendance.length; index += 1000) {
      await tx.attendance.createMany({ data: attendance.slice(index, index + 1000), skipDuplicates: true });
    }
    return { players: players.length, transactions: transactions.length, events: events.length };
  });
  return c.json({ imported }, 201);
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

app.post("/clubs/:clubId/jerseys", async (c) => {
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
  const jerseyUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  if (c.req.query("commit") === "0") return c.json({ jerseyUrl });
  const existing = await prisma.club.findUnique({ where: { id: clubId }, select: { jerseys: true } });
  if (!existing) throw new HttpError(404, "Club not found.");
  if (existing.jerseys.length >= 12) throw new HttpError(400, "Too many jerseys.");
  const club = await prisma.club.update({
    where: { id: clubId },
    data: { jerseys: [...existing.jerseys, jerseyUrl] },
  });
  return c.json({ club: clubDto(club), jerseyUrl });
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
  const onLeave = body.status === "left";
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
      leaveStart: onLeave && body.leaveStart ? utcDate(body.leaveStart) : null,
      leaveEnd: onLeave && body.leaveEnd ? utcDate(body.leaveEnd) : null,
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
  const onLeave = status === "left";
  const injuryArea = injured ? (body.injuryArea ?? existing.injuryArea).trim() : "";
  if (injured && !injuryArea) throw new HttpError(400, "Injury Area is required.");
  const expectedReturnDate = !injured
    ? null
    : body.expectedReturnDate === undefined
      ? existing.expectedReturnDate
      : body.expectedReturnDate
        ? utcDate(body.expectedReturnDate)
        : null;
  const leaveStart = !onLeave
    ? null
    : body.leaveStart === undefined
      ? existing.leaveStart
      : body.leaveStart
        ? utcDate(body.leaveStart)
        : null;
  const leaveEnd = !onLeave
    ? null
    : body.leaveEnd === undefined
      ? existing.leaveEnd
      : body.leaveEnd
        ? utcDate(body.leaveEnd)
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
      leaveStart,
      leaveEnd,
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

app.post("/clubs/:clubId/me/status", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  if (membership.role !== "player") throw new HttpError(403, "Only a player can report a status.");
  const existing = await prisma.player.findFirst({ where: { clubId, userId: user.id } });
  if (!existing) throw new HttpError(404, "Your roster profile is not linked.");
  const body = parseBody(playerStatusReportSchema, await readJson(c));

  if (body.kind === "injury") {
    const injuryArea = (body.injuryArea ?? "").trim();
    const expectedReturnDate = body.expectedReturnDate;
    if (!injuryArea || !expectedReturnDate) throw new HttpError(400, "Injury Area is required.");
    const player = await prisma.player.update({
      where: { id: existing.id },
      data: {
        status: "injured",
        injuryArea,
        expectedReturnDate: utcDate(expectedReturnDate),
        leaveStart: null,
        leaveEnd: null,
      },
    });
    await syncPlayerAttendance(player.id, clubId);
    const message = injuryStatusMessage(existing.name, injuryArea, expectedReturnDate);
    await prisma.statusNotice.create({
      data: { clubId, playerId: player.id, message, remarks: body.remarks },
    });
    return c.json({ player: await playerDto(player.id) });
  }

  const leaveStart = body.leaveStart;
  const leaveEnd = body.leaveEnd;
  if (!leaveStart || !leaveEnd) throw new HttpError(400, "Leave Period is required.");
  const player = await prisma.player.update({
    where: { id: existing.id },
    data: {
      status: "left",
      injuryArea: "",
      expectedReturnDate: null,
      leaveStart: utcDate(leaveStart),
      leaveEnd: utcDate(leaveEnd),
    },
  });
  await dropFutureUnanswered(player.id);
  const message = leaveStatusMessage(existing.name, leaveStart, leaveEnd);
  await prisma.statusNotice.create({
    data: { clubId, playerId: player.id, message, remarks: "" },
  });
  return c.json({ player: await playerDto(player.id) });
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

app.put("/clubs/:clubId/events/:eventId/lineup", async (c) => {
  const user = await authenticate(c);
  const clubId = c.req.param("clubId");
  const membership = await requireClub(user.id, clubId);
  assertManager(membership.role);
  const existing = await prisma.event.findFirst({
    where: { id: c.req.param("eventId"), clubId },
  });
  if (!existing) throw new HttpError(404, "Event not found.");
  if (existing.type !== "match" && existing.type !== "friendly") {
    throw new HttpError(400, "Lineup can only be attached to a match or friendly.");
  }
  const body = parseBody(lineupWriteSchema, await readJson(c));
  const playerIds = body.players.map((player) => player.playerId);
  const validPlayers = await prisma.player.count({
    where: { clubId, id: { in: playerIds } },
  });
  if (validPlayers !== playerIds.length) {
    throw new HttpError(400, "One or more selected players do not belong to this club.");
  }
  const event = await prisma.event.update({
    where: { id: existing.id },
    data: {
      lineup: {
        jerseyUrl: body.jerseyUrl ?? null,
        players: body.players,
      },
    },
  });
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

  if (!managesClub(membership.role)) throw new HttpError(403, "Only a manager can do that.");

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

function adminUserRows(
  users: Array<{
    id: string;
    email: string;
    name: string;
    createdAt: Date;
    lastLoginAt: Date | null;
    memberships: Array<{ id: string; role: string; clubId: string; club: { name: string } }>;
  }>,
): AdminUserRow[] {
  const rows: AdminUserRow[] = [];
  for (const user of users) {
    const base = {
      userId: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
    if (user.memberships.length === 0) {
      rows.push({ ...base, id: user.id, membershipId: null, role: "", clubId: "", clubName: "" });
      continue;
    }
    for (const membership of user.memberships) {
      rows.push({
        ...base,
        id: membership.id,
        membershipId: membership.id,
        role: membership.role,
        clubId: membership.clubId,
        clubName: membership.club.name,
      });
    }
  }
  rows.sort((a, b) => compareClubName(a.clubName, b.clubName) || compareClubName(a.name, b.name));
  return rows;
}

async function loadAdminUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      lastLoginAt: true,
      memberships: {
        select: { id: true, role: true, clubId: true, club: { select: { name: true } } },
      },
    },
  });
  return adminUserRows(users);
}

async function loadAdminClubs() {
  const clubs = await prisma.club.findMany({
    select: { id: true, name: true, createdAt: true },
  });
  return clubs
    .map((club) => ({ id: club.id, name: club.name, createdAt: club.createdAt.toISOString() }))
    .sort((a, b) => compareClubName(a.name, b.name));
}

app.get("/admin/users", async (c) => {
  const user = await authenticate(c);
  await requireAdmin(user.id);
  return c.json({ users: await loadAdminUsers() });
});

app.patch("/admin/users/:userId", async (c) => {
  const actor = await authenticate(c);
  await requireAdmin(actor.id);
  const userId = c.req.param("userId");
  const body = parseBody(adminUserPatchSchema, await readJson(c));
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "User not found.");
  const club = await prisma.club.findUnique({ where: { id: body.clubId }, select: { id: true } });
  if (!club) throw new HttpError(404, "Club not found.");

  if (body.membershipId) {
    const membership = await prisma.membership.findFirst({
      where: { id: body.membershipId, userId },
    });
    if (!membership) throw new HttpError(404, "Membership not found.");
    if (membership.role === "admin" && body.role !== "admin") {
      const adminTotal = await prisma.membership.count({ where: { role: "admin" } });
      if (adminTotal <= 1) throw new HttpError(403, "The administrator role can't be removed.");
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { name: body.name, email: body.email } });
      if (body.membershipId) {
        await tx.membership.update({
          where: { id: body.membershipId },
          data: { role: body.role, clubId: body.clubId },
        });
      } else {
        await tx.membership.create({
          data: { userId, clubId: body.clubId, role: body.role },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "That email or club membership is already in use.");
    }
    throw error;
  }
  return c.json({ users: await loadAdminUsers() });
});

app.delete("/admin/users/:userId", async (c) => {
  const actor = await authenticate(c);
  await requireAdmin(actor.id);
  const userId = c.req.param("userId");
  if (userId === actor.id) throw new HttpError(403, "You can't delete your own account.");
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "User not found.");
  const theirAdmin = await prisma.membership.count({ where: { userId, role: "admin" } });
  const adminTotal = await prisma.membership.count({ where: { role: "admin" } });
  if (theirAdmin > 0 && theirAdmin >= adminTotal) {
    throw new HttpError(403, "The administrator account can't be deleted.");
  }
  await prisma.user.delete({ where: { id: userId } });
  return c.json({ ok: true });
});

app.get("/admin/clubs", async (c) => {
  const user = await authenticate(c);
  await requireAdmin(user.id);
  return c.json({ clubs: await loadAdminClubs() });
});

app.patch("/admin/clubs/:clubId", async (c) => {
  const user = await authenticate(c);
  await requireAdmin(user.id);
  const clubId = c.req.param("clubId");
  const body = parseBody(adminClubPatchSchema, await readJson(c));
  const existing = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Club not found.");
  await prisma.club.update({ where: { id: clubId }, data: { name: body.name } });
  return c.json({ clubs: await loadAdminClubs() });
});

app.delete("/admin/clubs/:clubId", async (c) => {
  const user = await authenticate(c);
  await requireAdmin(user.id);
  const clubId = c.req.param("clubId");
  const existing = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Club not found.");
  const adminOnClub = await prisma.membership.count({ where: { clubId, role: "admin" } });
  const adminTotal = await prisma.membership.count({ where: { role: "admin" } });
  if (adminOnClub > 0 && adminOnClub >= adminTotal) {
    throw new HttpError(403, "The administrator club can't be deleted.");
  }
  await prisma.club.delete({ where: { id: clubId } });
  return c.json({ ok: true });
});
