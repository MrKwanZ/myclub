import { attendanceLabel, eventSummary, formatEventWhen, formatRepliedAt, type MyAttendanceRecord } from "@myclub/shared";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { useSession } from "../session";
import { colors } from "../theme";
import { Pill } from "../ui";

export function AttendanceScreen() {
  const session = useSession();
  const [records, setRecords] = useState<MyAttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId || session.role !== "player") {
      setRecords([]);
      return;
    }
    const result = await api.myAttendance(session.token, session.clubId);
    setRecords(result.records);
  }, [session.token, session.clubId, session.role]);

  useEffect(() => {
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your attendance.");
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

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
      <Text style={styles.title}>My attendance</Text>
      <Text style={styles.muted}>Your own record for sessions that have already happened.</Text>
      {session.role === "player" && records.length === 0 ? <Text style={styles.muted}>No past sessions yet.</Text> : null}
      {records.map((record) => (
        <View key={record.eventId} style={styles.card}>
          <Text style={styles.cardTitle}>{formatEventWhen(record.date, record.startTime)}</Text>
          <Text style={styles.muted}>
            {eventSummary(record)} · {record.location}
          </Text>
          <View style={styles.row}>
            <Pill text={attendanceLabel(record.status)} tone={record.status} />
            <Text style={styles.muted}>Replied Date {formatRepliedAt(record.repliedAt)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
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
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
