import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EmptyClub, LoginScreen } from "./src/screens/LoginScreen";
import { SessionProvider, useSession } from "./src/session";
import { Shell } from "./src/shell";
import { colors } from "./src/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const session = useSession();
  if (!session.ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!session.token || !session.user) return <LoginScreen />;
  if (session.user.memberships.length === 0) return <EmptyClub />;
  return <Shell />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvasSoft },
});
