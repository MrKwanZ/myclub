"use client";

import { NotificationCentre } from "@/components/NotificationCentre";
import { PlayerEvent, playerReplyLabel, type PlayerReply } from "@/components/PlayerEvent";
import { api } from "@/lib/api";
import { usePagedRows } from "@/lib/usePagedRows";
import { notifyDanger, notifyMaybeReminder, notifyReplied } from "@/lib/notify";
import { useSession } from "@/lib/session";
import {
  addDays,
  eventHasStarted,
  eventSummary,
  eventTypeLabel,
  formatEventWhen,
  formatRepliedAt,
  localISODate,
  playerHistoryLabel,
  type ClubEvent,
  type MyAttendanceRecord,
} from "@myclub/shared";
import { Card, Chip, Spinner, Table, Tabs } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

export default function PlayerDashboardPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <PlayerDashboard />
    </Suspense>
  );
}

function PlayerDashboard() {
  const session = useSession();
  const search = useSearchParams();
  const requested = search.get("tab");
  const [tab, setTab] = useState(requested === "attendance" || requested === "matches" ? requested : "upcoming");
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [matches, setMatches] = useState<ClubEvent[]>([]);
  const [records, setRecords] = useState<MyAttendanceRecord[]>([]);
  const [playerLinked, setPlayerLinked] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const reminded = useRef(new Set<string>());

  useEffect(() => {
    if (requested === "attendance" || requested === "matches" || requested === "upcoming") setTab(requested);
  }, [requested]);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || session.role !== "player") return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    Promise.all([
      api.events(token, clubId, { upcoming: "1" }),
      api.events(token, clubId, { finished: "1" }),
      api.myAttendance(token, clubId),
    ])
      .then(([upcoming, finished, attendance]) => {
        if (cancelled) return;
        setEvents(upcoming.events);
        setPlayerLinked(upcoming.playerLinked !== false);
        setMatches(finished.events);
        setRecords(attendance.records);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded(true);
          setError(err instanceof Error ? err.message : "Could not load the dashboard.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  useEffect(() => {
    if (!loaded || !playerLinked) return;
    const tomorrow = addDays(localISODate(), 1);
    for (const event of events) {
      if (event.date !== tomorrow || event.myAttendance?.status !== "maybe") continue;
      if (reminded.current.has(event.id)) continue;
      reminded.current.add(event.id);
      notifyMaybeReminder(event);
    }
  }, [loaded, playerLinked, events]);

  async function reply(eventId: string, status: PlayerReply) {
    if (!session.token || !session.clubId) return;
    setPendingId(eventId);
    setError(null);
    try {
      const result = await api.setAttendance(session.token, session.clubId, eventId, { status });
      const mark = { status: result.attendance.status, recordedBy: result.attendance.recordedBy };
      setEvents((current) =>
        current.map((event) => (event.id === eventId ? { ...event, myAttendance: mark } : event)),
      );
      const label = playerReplyLabel(status);
      if (label === "Yes" || label === "Maybe" || label === "No") notifyReplied(label);
      if (status === "maybe") {
        notifyMaybeReminder(events.find((item) => item.id === eventId));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save your reply.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="dash">
      <div className="page-heading">
        <div className="page-title">
          <h1>Dashboard</h1>
        </div>
        <NotificationCentre />
      </div>
      {error ? <p className="banner">{error}</p> : null}
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Player dashboard">
            <Tabs.Tab id="upcoming">
              Upcoming Event
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="matches">
              Past Matches
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="attendance">
              My Attendance
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="upcoming">
          {!loaded ? <p className="muted">Loading…</p> : null}
          {loaded && playerLinked && events.length === 0 ? <p className="muted">Nothing scheduled.</p> : null}
          <div className="event-list">
            {playerLinked
              ? events.map((event) => (
                  <PlayerEvent
                    key={event.id}
                    event={event}
                    pending={pendingId === event.id}
                    onReply={(status) => reply(event.id, status)}
                  />
                ))
              : null}
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="matches">
          {!loaded ? <p className="muted">Loading…</p> : null}
          {loaded && matches.length === 0 ? <p className="muted">No results yet.</p> : null}
          <div className="event-list">
            {matches.map((event) => (
              <PastMatch key={event.id} event={event} />
            ))}
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="attendance">
          <AttendanceTable records={records} loaded={loaded} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function PastMatch({ event }: { event: ClubEvent }) {
  return (
    <Card className="event-card">
      <Card.Header>
        <div className="event-card-title">
          <Card.Title>{event.name || event.opponent || "Match"}</Card.Title>
          <Card.Description>
            {event.startTime}
            {event.location ? ` · ${event.location}` : ""}
          </Card.Description>
        </div>
        <Chip className={eventChipClass(event.type)} color={eventChipColor(event.type)} size="sm" variant="soft">
          {eventTypeLabel(event.type)}
        </Chip>
      </Card.Header>
      <Card.Content>
        {event.opponent ? <p>{event.opponent}</p> : null}
        <p className={scoreClass(event.result)}>
          {event.scoreFor}–{event.scoreAgainst}
        </p>
      </Card.Content>
    </Card>
  );
}

function scoreClass(result: ClubEvent["result"]) {
  if (result === "win") return "score-win";
  if (result === "loss") return "score-loss";
  return undefined;
}

function AttendanceTable({ records, loaded }: { records: MyAttendanceRecord[]; loaded: boolean }) {
  const page = usePagedRows(records, 5, 7);

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="My attendance">
          <Table.Header>
            <Table.Column isRowHeader>Session</Table.Column>
            <Table.Column>Type</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Replied Date</Table.Column>
          </Table.Header>
          <Table.Body>
            {!loaded || (page.loading && page.rows.length === 0) ? (
              <Table.Row>
                <Table.Cell>Loading…</Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : null}
            {loaded && !page.loading && records.length === 0 ? (
              <Table.Row>
                <Table.Cell>No past sessions yet.</Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : null}
            {page.rows.map((record) => (
              <Table.Row key={record.eventId}>
                <Table.Cell>
                  <strong>{formatEventWhen(record.date, record.startTime)}</strong>
                  <p className="muted">
                    {eventSummary(record)} · {record.location}
                  </p>
                </Table.Cell>
                <Table.Cell>
                  <Chip className={eventChipClass(record.type)} color={eventChipColor(record.type)} size="sm" variant="soft">
                    {eventTypeLabel(record.type)}
                  </Chip>
                </Table.Cell>
                <Table.Cell>
                  <AttendanceStatus record={record} />
                </Table.Cell>
                <Table.Cell>{formatRepliedAt(record.repliedAt)}</Table.Cell>
              </Table.Row>
            ))}
            {page.hasMore ? (
              <Table.LoadMore isLoading={page.loading} onLoadMore={page.loadMore}>
                <Table.LoadMoreContent>
                  <Spinner size="sm" />
                </Table.LoadMoreContent>
              </Table.LoadMore>
            ) : null}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function AttendanceStatus({ record }: { record: MyAttendanceRecord }) {
  const started = eventHasStarted(record.date, record.startTime);
  if ((!record.status || record.status === "unanswered") && !started) {
    return (
      <Chip color="warning" size="sm" variant="soft">
        Pending Reply
      </Chip>
    );
  }
  return <>{playerHistoryLabel(record.status, started)}</>;
}

function eventChipColor(type: string) {
  switch (type) {
    case "match":
      return "accent" as const;
    case "friendly":
      return "success" as const;
    case "training":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function eventChipClass(type: string) {
  return type === "leisure" ? "chip-leisure" : undefined;
}
