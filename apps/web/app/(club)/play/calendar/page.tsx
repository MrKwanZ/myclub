"use client";

import { NotificationCentre } from "@/components/NotificationCentre";
import { PlayerEvent, playerReplyLabel, type PlayerReply } from "@/components/PlayerEvent";
import { api } from "@/lib/api";
import { initialDay } from "@/lib/calendarDay";
import { notifyDanger, notifyMaybeReminder, notifyReplied } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { formatLongDate, type ClubEvent } from "@myclub/shared";
import { Button, Calendar } from "@heroui/react";
import { getLocalTimeZone, parseDate, today, type CalendarDate, type DateValue } from "@internationalized/date";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function loadWindow(focused: CalendarDate) {
  const start = focused.subtract({ months: 1 }).set({ day: 1 });
  const end = start.add({ months: 8 }).subtract({ days: 1 });
  return { from: start.toString(), to: end.toString() };
}

export default function PlayerCalendarPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <PlayerCalendar />
    </Suspense>
  );
}

function PlayerCalendar() {
  const session = useSession();
  const requestedDate = useSearchParams().get("date");
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState<CalendarDate | null>(null);
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [playerLinked, setPlayerLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const day = initialDay(requestedDate);
    setFocused(day);
    setSelected(day.toString());
    setReady(true);
  }, [requestedDate]);

  const rangeKey = focused ? `${focused.year}-${focused.month}` : "";

  useEffect(() => {
    if (!ready || !focused || session.status !== "in" || !session.token || !session.clubId || session.role !== "player") {
      return;
    }
    const token = session.token;
    const clubId = session.clubId;
    const { from, to } = loadWindow(focused);
    let cancelled = false;
    api
      .events(token, clubId, { from, to })
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setPlayerLinked(result.playerLinked !== false);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the calendar.");
      });
    return () => {
      cancelled = true;
    };
    // Refetch when the visible month changes, not when focus moves within the month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rangeKey, session.status, session.token, session.clubId, session.role]);

  const byDate = useMemo(() => {
    const map = new Map<string, ClubEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);

  function goToNextActivity() {
    const upcoming = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const next = upcoming.find((event) => event.date > selected);
    if (!next) return;
    setSelected(next.date);
    setFocused(parseDate(next.date));
  }

  async function reply(eventId: string, status: PlayerReply) {
    if (!session.token || !session.clubId) return;
    setPendingId(eventId);
    setError(null);
    try {
      const result = await api.setAttendance(session.token, session.clubId, eventId, { status });
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, myAttendance: { status: result.attendance.status, recordedBy: result.attendance.recordedBy } }
            : event,
        ),
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

  const dayEvents = (byDate.get(selected) ?? []).slice();

  if (!ready || !focused) return <p className="muted">Loading…</p>;

  const selectedDate = parseDate(selected);

  function renderCell(date: DateValue) {
    const hasEvents = (byDate.get(date.toString()) ?? []).length > 0;
    return (
      <Calendar.Cell date={date as CalendarDate} data-testid={`calendar-cell-${date.toString()}`}>
        {({ formattedDate }) => (
          <>
            {formattedDate}
            {hasEvents ? <Calendar.CellIndicator /> : null}
          </>
        )}
      </Calendar.Cell>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Events Calendar</h1>
        </div>
        <NotificationCentre />
      </div>
      {error ? <p className="muted">{error}</p> : null}
      <Calendar
        aria-label="Club calendar"
        className="club-calendar"
        firstDayOfWeek="sun"
        focusedValue={focused}
        value={selectedDate}
        visibleDuration={{ months: 2 }}
        onChange={(value) => {
          if (value && !Array.isArray(value)) setSelected(value.toString());
        }}
        onFocusChange={(value) => {
          if (value) setFocused(parseDate(value.toString().slice(0, 10)));
        }}
      >
        <div className="calendar-months">
          <div className="calendar-month">
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => renderCell(date)}</Calendar.GridBody>
            </Calendar.Grid>
          </div>
          <div className="calendar-month">
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading offset={{ months: 1 }} />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid offset={{ months: 1 }}>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => renderCell(date)}</Calendar.GridBody>
            </Calendar.Grid>
          </div>
        </div>
        <Calendar.YearPickerGrid>
          <Calendar.YearPickerGridBody>{({ year }) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody>
        </Calendar.YearPickerGrid>
      </Calendar>
      <div className="calendar-actions">
        <Button variant="secondary" onPress={goToNextActivity}>
          Next Activity
        </Button>
      </div>
      <section className="stack">
        <h2>{formatLongDate(selected)}</h2>
        {dayEvents.length === 0 ? <p className="muted">Nothing on this day.</p> : null}
        {playerLinked
          ? dayEvents.map((event) => (
              <PlayerEvent
                key={event.id}
                showLineup
                event={event}
                pending={pendingId === event.id}
                onReply={(status) => reply(event.id, status)}
              />
            ))
          : null}
      </section>
    </>
  );
}
