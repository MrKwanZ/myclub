import type {
  Announcement,
  AttendanceRow,
  AdminClubRow,
  AdminUserRow,
  AuthUser,
  Club,
  ClubEvent,
  ClubImport,
  ClubWrite,
  Dashboard,
  EventWrite,
  LineupWrite,
  MyAttendanceRecord,
  NotificationItem,
  NotificationWrite,
  Player,
  PlayerDetail,
  PlayerWrite,
  StatusNotice,
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
  updateProfile(token: string, body: { name: string; contact: string; avatarUrl?: string }) {
    return request<{ user: AuthUser }>("/auth/me", { method: "PATCH", token, body });
  },
  changePassword(token: string, body: { currentPassword: string; newPassword: string }) {
    return request<{ ok: true }>("/auth/password", { method: "POST", token, body });
  },
  async uploadAvatar(token: string, file: File, options?: { commit?: boolean }) {
    let response: Response;
    const body = new FormData();
    body.append("file", file);
    const commit = options?.commit === false ? "?commit=0" : "";
    try {
      response = await fetch(`${base}/auth/avatar${commit}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    } catch {
      throw new ApiError(0, "Can't reach the server. Start the API and try again.");
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; avatarUrl?: string; user?: AuthUser };
    if (!response.ok) throw new ApiError(response.status, data.error ?? "Could not upload the photo.");
    return data as { avatarUrl?: string; user?: AuthUser };
  },
  attendanceAlerts(token: string) {
    return request<{ alerts: { clubId: string; message: string }[] }>("/me/attendance-alerts", { token });
  },
  createClub(token: string, body: ClubWrite) {
    return request<{ club: Club; user: AuthUser }>("/clubs", { method: "POST", token, body });
  },
  importClubData(token: string, clubId: string, body: ClubImport) {
    return request<{ imported: { players: number; transactions: number; events: number } }>(
      `/clubs/${clubId}/import`,
      { method: "POST", token, body },
    );
  },
  club(token: string, clubId: string) {
    return request<{ club: Club }>(`/clubs/${clubId}`, { token });
  },
  updateClub(
    token: string,
    clubId: string,
    body: Partial<ClubWrite> & {
      logoUrl?: string;
      jerseys?: string[];
      attendanceAlertEnabled?: boolean;
      attendanceAlertPercent?: number | null;
    },
  ) {
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
  async uploadJersey(token: string, clubId: string, file: File, options?: { commit?: boolean }) {
    let response: Response;
    const body = new FormData();
    body.append("file", file);
    const commit = options?.commit === false ? "?commit=0" : "";
    try {
      response = await fetch(`${base}/clubs/${clubId}/jerseys${commit}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    } catch {
      throw new ApiError(0, "Can't reach the server. Start the API and try again.");
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; club?: Club; jerseyUrl?: string };
    if (!response.ok) throw new ApiError(response.status, data.error ?? "Could not upload the jersey.");
    return data as { club?: Club; jerseyUrl?: string };
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
  saveEventLineup(token: string, clubId: string, eventId: string, body: LineupWrite) {
    return request<{ event: ClubEvent }>(`/clubs/${clubId}/events/${eventId}/lineup`, {
      method: "PUT",
      token,
      body,
    });
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
  reportStatus(
    token: string,
    clubId: string,
    body:
      | { kind: "injury"; injuryArea: string; expectedReturnDate: string; remarks?: string }
      | { kind: "leave"; leaveStart: string; leaveEnd: string },
  ) {
    return request<{ player: Player }>(`/clubs/${clubId}/me/status`, { method: "POST", token, body });
  },
  announcements(token: string) {
    return request<{ announcements: Announcement[] }>("/me/announcements", { token });
  },
  readAnnouncements(token: string, ids: string[]) {
    return request<{ ok: true }>("/me/announcements/read", { method: "POST", token, body: { ids } });
  },
  createAnnouncement(token: string, clubId: string, body: { title: string; content: string }) {
    return request<{ announcement: Announcement }>(`/clubs/${clubId}/announcements`, { method: "POST", token, body });
  },
  statusNotices(token: string) {
    return request<{ notices: StatusNotice[] }>("/me/status-notices", { token });
  },
  readStatusNotices(token: string, ids: string[]) {
    return request<{ ok: true }>("/me/status-notices/read", { method: "POST", token, body: { ids } });
  },
  notifications(token: string, clubId: string | null) {
    const suffix = clubId ? `?clubId=${encodeURIComponent(clubId)}` : "";
    return request<{ notifications: NotificationItem[] }>(`/me/notifications${suffix}`, { token });
  },
  recordNotification(token: string, body: NotificationWrite) {
    return request<{ notification: NotificationItem }>("/me/notifications", { method: "POST", token, body });
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
  adminUsers(token: string) {
    return request<{ users: AdminUserRow[] }>("/admin/users", { token });
  },
  updateAdminUser(
    token: string,
    userId: string,
    body: { membershipId?: string | null; name: string; email: string; role: string; clubId: string },
  ) {
    return request<{ users: AdminUserRow[] }>(`/admin/users/${userId}`, { method: "PATCH", token, body });
  },
  deleteAdminUser(token: string, userId: string) {
    return request<{ ok: true }>(`/admin/users/${userId}`, { method: "DELETE", token });
  },
  adminClubs(token: string) {
    return request<{ clubs: AdminClubRow[] }>("/admin/clubs", { token });
  },
  updateAdminClub(token: string, clubId: string, body: { name: string }) {
    return request<{ clubs: AdminClubRow[] }>(`/admin/clubs/${clubId}`, { method: "PATCH", token, body });
  },
  deleteAdminClub(token: string, clubId: string) {
    return request<{ ok: true }>(`/admin/clubs/${clubId}`, { method: "DELETE", token });
  },
};
