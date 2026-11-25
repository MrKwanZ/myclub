import { localISODate, monthBounds, monthGrid, monthTitle, shiftMonth, type ClubEvent } from "@myclub/shared";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, api } from "../api";
import { useSession } from "../session";
import { colors } from "../theme";
import { Button } from "../ui";
import { EventCard } from "./UpcomingScreen";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarScreen() {
  const session = useSession();
  const now = new Date();
  const [today] = useState(localISODate(now));
  const [cursor, setCursor] = useState({ year: now.getFullYear(), monthIndex: now.getMonth() });
  const [selected, setSelected] = useState(localISODate(now));
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [playerLinked, setPlayerLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!session.token || !session.clubId) return;
    const token = session.token;
    const clubId = session.clubId;
    const bounds = monthBounds(cursor.year, cursor.monthIndex);
    let cancelled = false;
    api
      .events(token, clubId, { from: bounds.from, to: bounds.to })
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setPlayerLinked(session.role === "player" ? result.playerLinked !== false : false);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the calendar.");
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, session.token, session.clubId, session.role]);

  function move(delta: number) {
    const next = shiftMonth(cursor.year, cursor.monthIndex, delta);
    setCursor(next);
    setSelected(monthBounds(next.year, next.monthIndex).from);
  }

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

  const cells = monthGrid(cursor.year, cursor.monthIndex);
  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  const byDate = new Map<string, ClubEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }
  const dayEvents = (byDate.get(selected) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const canReply = session.role === "player" && playerLinked;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Calendar</Text>
      <View style={styles.spread}>
        <Text style={styles.month}>{monthTitle(cursor.year, cursor.monthIndex)}</Text>
        <View style={styles.row}>
          <Button label="Prev" kind="utility" onPress={() => move(-1)} />
          <Button label="Next" kind="utility" onPress={() => move(1)} />
        </View>
      </View>
      <View style={styles.week}>
        {weekdays.map((day) => (
          <Text key={day} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((iso, dayIndex) => {
            if (!iso) return <View key={`empty-${weekIndex}-${dayIndex}`} style={styles.cell} />;
            const count = byDate.get(iso)?.length ?? 0;
            const active = iso === selected;
            return (
              <Pressable
                key={iso}
                accessibilityRole="button"
                onPress={() => setSelected(iso)}
                style={[styles.cell, styles.day, active ? styles.selected : null]}
              >
                <Text style={[styles.num, iso === today ? styles.today : null]}>{Number(iso.slice(-2))}</Text>
                {count > 0 ? <Text style={styles.count}>{count}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={styles.section}>{selected}</Text>
      {dayEvents.length === 0 ? <Text style={styles.muted}>Nothing on this day.</Text> : null}
      {dayEvents.map((event) => (
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

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.6, color: colors.ink },
  month: { fontSize: 20, fontWeight: "700", color: colors.ink },
  muted: { color: colors.inkMuted, fontSize: 15 },
  section: { fontSize: 18, fontWeight: "700", marginTop: 8, color: colors.ink },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  row: { flexDirection: "row", gap: 8 },
  week: { flexDirection: "row" },
  weekRow: { flexDirection: "row", gap: 4 },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: colors.inkMuted },
  cell: { flex: 1, minHeight: 52 },
  day: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 4,
  },
  selected: { borderColor: colors.primary },
  num: { fontSize: 13, fontWeight: "600", color: colors.ink },
  today: { color: colors.primary },
  count: { fontSize: 11, color: colors.teal, fontWeight: "600" },
});
