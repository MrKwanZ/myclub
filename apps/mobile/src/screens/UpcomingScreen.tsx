import {
  attendanceLabel,
  eventSummary,
  eventTypeLabel,
  formatEventWhen,
  recorderLabel,
  type ClubEvent,
} from "@myclub/shared";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, api } from "../api";
import { useSession } from "../session";
import { colors } from "../theme";
import { Button, Pill } from "../ui";

export function UpcomingScreen() {
  const session = useSession();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [playerLinked, setPlayerLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId) return;
    const result = await api.events(session.token, session.clubId, { upcoming: "1" });
    setEvents(result.events);
    setPlayerLinked(session.role === "player" ? result.playerLinked !== false : false);
  }, [session.token, session.clubId, session.role]);

  useEffect(() => {
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load upcoming sessions.");
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function reply(eventId: string, status: "present" | "absent") {
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await session.signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save your reply.");
    } finally {
      setPendingId(null);
    }
  }

  const canReply = session.role === "player" && playerLinked;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load()
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not refresh."))
              .finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={styles.title}>Upcoming</Text>
      <Text style={styles.muted}>Training and matches still to come.</Text>
      {events.length === 0 ? <Text style={styles.muted}>Nothing scheduled.</Text> : null}
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          canReply={canReply}
          pending={pendingId === event.id}
          onReply={(status) => reply(event.id, status)}
        />
      ))}
    </ScrollView>
  );
}

export function EventCard({
  event,
  canReply,
  pending,
  onReply,
}: {
  event: ClubEvent;
  canReply: boolean;
  pending: boolean;
  onReply: (status: "present" | "absent") => void;
}) {
  const status = event.myAttendance?.status ?? "unanswered";
  return (
    <View style={styles.card}>
      <View style={styles.spread}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{formatEventWhen(event.date, event.startTime)}</Text>
          <Text style={styles.muted}>
            {eventSummary(event)} · {event.location}
          </Text>
        </View>
        <Pill text={eventTypeLabel(event.type)} tone={event.type} />
      </View>
      {event.notes ? <Text>{event.notes}</Text> : null}
      {event.result ? (
        <Text style={styles.muted}>
          {event.scoreFor}–{event.scoreAgainst} · {event.result}
        </Text>
      ) : null}
      {canReply ? (
        <View style={styles.row}>
          <Button label="Present" kind="utility" selected={status === "present"} disabled={pending} onPress={() => onReply("present")} />
          <Button label="Absent" kind="utility" selected={status === "absent"} disabled={pending} onPress={() => onReply("absent")} />
        </View>
      ) : null}
      {event.myAttendance ? (
        <Text style={styles.muted}>
          {attendanceLabel(status)} · {recorderLabel(event.myAttendance.recordedBy, "player")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.6, color: colors.ink },
  muted: { color: colors.inkMuted, fontSize: 15, lineHeight: 20 },
  card: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  spread: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  flex: { flex: 1, gap: 4 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
