import type { AuthUser, ClubEvent, MyAttendanceRecord } from "@myclub/shared";
import { Platform } from "react-native";

export function apiBase() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: { method?: string; token?: string | null; body?: unknown } = {}) {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Start the API and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error ?? "Request failed.");
  return data as T;
}

export const api = {
  login(body: { email: string; password: string }) {
    return request<{ token: string; user: AuthUser }>("/auth/login", { method: "POST", body });
  },
  me(token: string) {
    return request<{ user: AuthUser }>("/auth/me", { token });
  },
  events(token: string, clubId: string, query: Record<string, string> = {}) {
    const params = new URLSearchParams(query);
    const queryString = params.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return request<{ events: ClubEvent[]; playerLinked?: boolean }>(`/clubs/${clubId}/events${suffix}`, {
      token,
    });
  },
  setAttendance(token: string, clubId: string, eventId: string, body: { status: "present" | "absent" }) {
    return request<{ attendance: { status: string; recordedBy: string | null } }>(
      `/clubs/${clubId}/events/${eventId}/attendance`,
      { method: "PUT", token, body },
    );
  },
  myAttendance(token: string, clubId: string) {
    return request<{ records: MyAttendanceRecord[] }>(`/clubs/${clubId}/me/attendance`, { token });
  },
};
