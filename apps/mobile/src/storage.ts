import { Platform } from "react-native";

const memory = new Map<string, string>();

export async function readStored(key: string) {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  }
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(key);
}

export async function writeStored(key: string, value: string) {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
      return;
    } catch {
      memory.set(key, value);
      return;
    }
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(key, value);
}

export async function removeStored(key: string) {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      memory.delete(key);
    }
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(key);
}
