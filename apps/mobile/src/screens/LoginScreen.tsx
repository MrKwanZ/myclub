import { loginSchema } from "@myclub/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, api } from "../api";
import { useSession } from "../session";
import { colors } from "../theme";
import { Button, Field } from "../ui";

export function LoginScreen() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setPending(true);
    try {
      const result = await api.login(parsed.data);
      await session.signIn(result.token, result.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>MYCLUB</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.muted}>Reply to training and matches. Your manager creates the login.</Text>
          <Field
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
          <Button label={pending ? "Signing in…" : "Sign in"} onPress={onSubmit} disabled={pending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function EmptyClub() {
  const session = useSession();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>No club yet</Text>
        <Text style={styles.muted}>Ask a manager to add you to the roster, or create a club on the web.</Text>
        <Button label="Sign out" kind="utility" onPress={() => void session.signOut()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvasSoft },
  flex: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: "center" },
  eyebrow: { fontSize: 12, fontWeight: "600", letterSpacing: 0.4, color: colors.inkMuted },
  title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8, color: colors.ink },
  muted: { color: colors.inkMuted, fontSize: 16, lineHeight: 22 },
});
