"use client";

import { PlayerEvent, playerReplyLabel, type PlayerReply } from "@/components/PlayerEvent";
import { api } from "@/lib/api";
import { notifyDanger, notifyReplied } from "@/lib/notify";
import { useSession } from "@/lib/session";
import type { ClubEvent } from "@myclub/shared";
import { useEffect, useState } from "react";

export default function UpcomingPage() {
  const session = useSession();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [playerLinked, setPlayerLinked] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || session.role !== "player") return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .events(token, clubId, { upcoming: "1" })
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setPlayerLinked(result.playerLinked !== false);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded(true);
          setError(err instanceof Error ? err.message : "Could not load upcoming sessions.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

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
      if (label) notifyReplied(label);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save your reply.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>Upcoming Events</h1>
      </div>
      {!loaded ? <p className="muted">Loading…</p> : null}
      {loaded && playerLinked && events.length === 0 ? <p className="muted">Nothing scheduled.</p> : null}
      <div className="event-list">
        {playerLinked
          ? events.map((event) => (
              <PlayerEvent key={event.id} event={event} pending={pendingId === event.id} onReply={(status) => reply(event.id, status)} />
            ))
          : null}
      </div>
    </>
  );
}
