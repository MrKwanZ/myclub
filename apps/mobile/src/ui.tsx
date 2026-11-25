import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "./theme";

export function Field({ label, ...inputProps }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.inkFaint} style={styles.input} {...inputProps} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  kind = "primary",
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "utility";
  selected?: boolean;
}) {
  const filled = kind === "primary" || selected;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled ? styles.primary : styles.utility,
        pressed && filled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={filled ? styles.primaryText : styles.utilityText}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <View style={[styles.banner, ok ? styles.bannerOk : null]}>
      <Text style={{ color: ok ? "#0d7a28" : colors.orange }}>{text}</Text>
    </View>
  );
}

export function Pill({ text, tone }: { text: string; tone?: string }) {
  const color = tone === "match" || tone === "absent" || tone === "expense" ? colors.orange : tone === "training" || tone === "present" ? colors.teal : tone === "late" ? "#391c57" : colors.inkSecondary;
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: colors.inkMuted },
  input: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    minHeight: 44,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  primary: { backgroundColor: colors.primary },
  pressed: { backgroundColor: colors.primaryActive },
  utility: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: "500" },
  utilityText: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  banner: { backgroundColor: "#fff4ec", borderRadius: 8, padding: 12 },
  bannerOk: { backgroundColor: "#eefaf1" },
  pill: {
    backgroundColor: colors.canvasSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "600" },
});
