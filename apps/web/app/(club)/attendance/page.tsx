"use client";

import { Field } from "@/components/Field";
import { NotificationCentre } from "@/components/NotificationCentre";
import { api } from "@/lib/api";
import { notifyDanger, notifySaved } from "@/lib/notify";
import { useSession } from "@/lib/session";
import {
  attendanceLabel,
  eventSummary,
  attendanceStatuses,
  formatEventWhen,
  localISODate,
  recorderLabel,
  type AttendanceRow,
  type AttendanceStatus,
  type ClubEvent,
} from "@myclub/shared";
import { useEffect, useState } from "react";

function preferredEvent(events: ClubEvent[]) {
  const today = localISODate();
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return ordered.find((event) => event.date >= today)?.id ?? ordered[ordered.length - 1]?.id ?? null;
}

export default function AttendancePage() {
  const session = useSession();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || session.role !== "manager") return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .events(token, clubId)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setEventId((current) =>
          current && result.events.some((event) => event.id === current) ? current : preferredEvent(result.events),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sessions.");
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || !eventId || session.role !== "manager") return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .attendance(token, clubId, eventId)
      .then((result) => {
        if (!cancelled) setRows(result.attendance);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load attendance.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, session.status, session.token, session.clubId, session.role]);

  async function onStatus(playerId: string, status: AttendanceStatus) {
    if (!session.token || !session.clubId || !eventId) return;
    const previous = rows;
    setRows(
      rows.map((row) =>
        row.playerId === playerId
          ? { ...row, status, recordedBy: status === "unanswered" ? null : "manager" }
          : row,
      ),
    );
    setPendingId(playerId);
    setError(null);
    try {
      await api.setAttendance(session.token, session.clubId, eventId, { playerId, status });
      notifySaved();
    } catch (err) {
      setRows(previous);
      const message = err instanceof Error ? err.message : "Could not save attendance.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPendingId(null);
    }
  }

  const selected = events.find((event) => event.id === eventId) ?? null;
  const attended = rows.filter((row) => row.status === "present" || row.status === "late").length;

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Attendance</h1>
        </div>
        <NotificationCentre />
      </div>
      {events.length === 0 ? (
        <p className="muted">Add a training or match on the calendar first.</p>
      ) : (
        <section className="card stack">
          <Field label="Session">
            <select value={eventId ?? ""} onChange={(event) => setEventId(event.target.value)}>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {formatEventWhen(event.date, event.startTime)} ·{" "}
                  {eventSummary(event)}
                </option>
              ))}
            </select>
          </Field>
          {selected ? (
            <p className="muted">
              {attended} of {rows.length} present or late
              {selected.location ? ` · ${selected.location}` : ""}
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>No.</th>
                  <th>Reply</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No players are on this list. Active and injured players are added automatically.
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.playerName}{" "}
                      {row.playerStatus !== "active" ? <span className="pill">{row.playerStatus}</span> : null}
                    </td>
                    <td>{row.shirtNumber ?? "–"}</td>
                    <td>
                      <select
                        value={row.status}
                        disabled={pendingId === row.playerId}
                        onChange={(event) => onStatus(row.playerId, event.target.value as AttendanceStatus)}
                      >
                        {attendanceStatuses.map((status) => (
                          <option key={status} value={status}>
                            {attendanceLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="muted">{recorderLabel(row.recordedBy, "manager")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
