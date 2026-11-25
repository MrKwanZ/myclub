import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AttendanceScreen } from "./screens/AttendanceScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { UpcomingScreen } from "./screens/UpcomingScreen";
import { useSession } from "./session";
import { colors } from "./theme";

type Tab = "upcoming" | "calendar" | "attendance";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "calendar", label: "Calendar" },
  { id: "attendance", label: "Attendance" },
];

export function Shell() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("upcoming");
  const membership = session.user?.memberships.find((item) => item.clubId === session.clubId);

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.brand}>MyClub</Text>
            <Text style={styles.muted}>
              {membership ? `${membership.club.name} · ${membership.role}` : "No club"}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void session.signOut()} style={styles.signOut}>
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>
        {session.user && session.user.memberships.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubs}>
            {session.user.memberships.map((item) => {
              const active = item.clubId === session.clubId;
              return (
                <Pressable
                  key={item.clubId}
                  accessibilityRole="button"
                  onPress={() => void session.setClubId(item.clubId)}
                  style={[styles.clubChip, active ? styles.clubChipActive : null]}
                >
                  <Text style={active ? styles.clubChipTextActive : styles.clubChipText}>
                    {item.club.name} · {item.role}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </SafeAreaView>
      <View style={styles.body} key={session.clubId ?? "none"}>
        {tab === "upcoming" ? <UpcomingScreen /> : null}
        {tab === "calendar" ? <CalendarScreen /> : null}
        {tab === "attendance" ? <AttendanceScreen /> : null}
      </View>
      <SafeAreaView edges={["bottom"]} style={styles.tabs}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setTab(item.id)}
              style={[styles.tab, active ? styles.tabActive : null]}
            >
              <Text style={active ? styles.tabTextActive : styles.tabText}>{item.label}</Text>
            </Pressable>
          );
        })}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvasSoft },
  headerWrap: { backgroundColor: colors.canvas, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  flex: { flex: 1, gap: 2 },
  brand: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, color: colors.ink },
  muted: { color: colors.inkMuted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 16, fontWeight: "500" },
  signOut: { minHeight: 44, justifyContent: "center" },
  clubs: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  clubChip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
  },
  clubChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  clubChipText: { color: colors.ink, fontSize: 14 },
  clubChipTextActive: { color: colors.onPrimary, fontSize: 14, fontWeight: "600" },
  body: { flex: 1 },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" },
  tabActive: { borderTopWidth: 2, borderTopColor: colors.primary },
  tabText: { color: colors.inkMuted, fontSize: 14 },
  tabTextActive: { color: colors.primary, fontSize: 14, fontWeight: "600" },
});
