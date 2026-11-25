import type {
  AttendanceRow,
  AuthUser,
  Club,
  ClubEvent,
  ClubWrite,
  Dashboard,
  EventWrite,
  MyAttendanceRecord,
  Player,
  PlayerDetail,
  PlayerWrite,
  Transaction,
  TransactionWrite,
} from "@myclub/shared";

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    response = await fetch(`${base}${path}`, {
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
  register(body: { email: string; name: string; password: string }) {
    return request<{ user: AuthUser }>("/auth/register", { method: "POST", body });
  },
  login(body: { email: string; password: string }) {
    return request<{ token: string; user: AuthUser }>("/auth/login", { method: "POST", body });
  },
  me(token: string) {
    return request<{ user: AuthUser }>("/auth/me", { token });
  },
  createClub(token: string, body: ClubWrite) {
    return request<{ club: Club; user: AuthUser }>("/clubs", { method: "POST", token, body });
  },
  club(token: string, clubId: string) {
    return request<{ club: Club }>(`/clubs/${clubId}`, { token });
  },
  updateClub(token: string, clubId: string, body: Partial<ClubWrite>) {
    return request<{ club: Club }>(`/clubs/${clubId}`, { method: "PATCH", token, body });
  },
  async uploadLogo(token: string, clubId: string, file: File, options?: { commit?: boolean }) {
    let response: Response;
    const body = new FormData();
    body.append("file", file);
    const commit = options?.commit === false ? "?commit=0" : "";
    try {
      response = await fetch(`${base}/clubs/${clubId}/logo${commit}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    } catch {
      throw new ApiError(0, "Can't reach the server. Start the API and try again.");
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; club?: Club; logoUrl?: string };
    if (!response.ok) throw new ApiError(response.status, data.error ?? "Could not upload the logo.");
    return data as { club?: Club; logoUrl?: string };
  },
  dashboard(token: string, clubId: string) {
    return request<Dashboard>(`/clubs/${clubId}/dashboard`, { token });
  },
  players(token: string, clubId: string) {
    return request<{ players: Player[] }>(`/clubs/${clubId}/players`, { token });
  },
  player(token: string, clubId: string, playerId: string) {
    return request<{ player: PlayerDetail }>(`/clubs/${clubId}/players/${playerId}`, { token });
  },
  createPlayer(token: string, clubId: string, body: PlayerWrite) {
    return request<{ player: Player }>(`/clubs/${clubId}/players`, { method: "POST", token, body });
  },
  updatePlayer(token: string, clubId: string, playerId: string, body: Partial<PlayerWrite>) {
    return request<{ player: Player }>(`/clubs/${clubId}/players/${playerId}`, { method: "PATCH", token, body });
  },
  deletePlayer(token: string, clubId: string, playerId: string) {
    return request<{ ok: true }>(`/clubs/${clubId}/players/${playerId}`, { method: "DELETE", token });
  },
  createPlayerAccount(token: string, clubId: string, playerId: string, body: { email: string; password?: string }) {
    return request<{ player: Player; linkedExisting: boolean }>(`/clubs/${clubId}/players/${playerId}/account`, {
      method: "POST",
      token,
      body,
    });
  },
  events(token: string, clubId: string, query: Record<string, string> = {}) {
    const params = new URLSearchParams(query);
    const queryString = params.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return request<{ events: ClubEvent[]; playerLinked?: boolean }>(`/clubs/${clubId}/events${suffix}`, { token });
  },
  createEvent(token: string, clubId: string, body: EventWrite) {
    return request<{ event: ClubEvent }>(`/clubs/${clubId}/events`, { method: "POST", token, body });
  },
  updateEvent(token: string, clubId: string, eventId: string, body: Partial<EventWrite>) {
    return request<{ event: ClubEvent }>(`/clubs/${clubId}/events/${eventId}`, { method: "PATCH", token, body });
  },
  attendance(token: string, clubId: string, eventId: string) {
    return request<{ attendance: AttendanceRow[] }>(`/clubs/${clubId}/events/${eventId}/attendance`, { token });
  },
  setAttendance(
    token: string,
    clubId: string,
    eventId: string,
    body: { playerId: string; status: string } | { status: "present" | "absent" | "maybe" },
  ) {
    return request<{ attendance: { status: string; recordedBy: string | null } }>(
      `/clubs/${clubId}/events/${eventId}/attendance`,
      { method: "PUT", token, body },
    );
  },
  myAttendance(token: string, clubId: string) {
    return request<{ records: MyAttendanceRecord[] }>(`/clubs/${clubId}/me/attendance`, { token });
  },
  transactions(token: string, clubId: string) {
    return request<{ balance: string; transactions: Transaction[] }>(`/clubs/${clubId}/transactions`, { token });
  },
  createTransaction(token: string, clubId: string, body: TransactionWrite) {
    return request<{ transaction: Transaction; balance: string }>(`/clubs/${clubId}/transactions`, {
      method: "POST",
      token,
      body,
    });
  },
  updateTransaction(token: string, clubId: string, transactionId: string, body: TransactionWrite) {
    return request<{ transaction: Transaction; balance: string }>(`/clubs/${clubId}/transactions/${transactionId}`, {
      method: "PATCH",
      token,
      body,
    });
  },
  deleteTransaction(token: string, clubId: string, transactionId: string) {
    return request<{ ok: true; balance: string }>(`/clubs/${clubId}/transactions/${transactionId}`, {
      method: "DELETE",
      token,
    });
  },
};
