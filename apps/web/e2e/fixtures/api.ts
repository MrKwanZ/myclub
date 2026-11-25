export const API_URL = "http://localhost:4001";

export function offsetDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@e2e.test`;
}

async function apiRequest<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`API ${opts.method ?? "GET"} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data as T;
}

export const e2eApi = {
  register(body: { email: string; name: string; password: string }) {
    return apiRequest<{ user: { id: string; email: string; name: string } }>("/auth/register", { body });
  },
  login(body: { email: string; password: string }) {
    return apiRequest<{
      token: string;
      user: {
        id: string;
        email: string;
        name: string;
        memberships: Array<{ clubId: string; role: string; club: { id: string; name: string } }>;
      };
    }>("/auth/login", { body });
  },
  createClub(token: string, body: { name: string; description?: string; goals?: string }) {
    return apiRequest<{ club: { id: string; name: string } }>("/clubs", { token, body });
  },
  createPlayer(
    token: string,
    clubId: string,
    body: {
      name: string;
      position?: string;
      shirtNumber?: number | null;
      contact?: string;
      status?: "active" | "injured" | "left";
      injuryArea?: string;
      expectedReturnDate?: string | null;
      goals?: number;
      assists?: number;
    },
  ) {
    return apiRequest<{ player: { id: string; name: string } }>(`/clubs/${clubId}/players`, { token, body });
  },
  deletePlayer(token: string, clubId: string, playerId: string) {
    return apiRequest<{ ok: true }>(`/clubs/${clubId}/players/${playerId}`, {
      method: "DELETE",
      token,
    });
  },
  createPlayerAccount(
    token: string,
    clubId: string,
    playerId: string,
    body: { email: string; password?: string },
  ) {
    return apiRequest<{ player: { id: string; userId: string | null }; linkedExisting: boolean }>(
      `/clubs/${clubId}/players/${playerId}/account`,
      { token, body },
    );
  },
  createEvent(
    token: string,
    clubId: string,
    body: {
      type: "training" | "match" | "leisure" | "friendly";
      name?: string;
      date: string;
      startTime: string;
      location: string;
      notes?: string;
      opponent?: string;
      scoreFor?: number;
      scoreAgainst?: number;
    },
  ) {
    return apiRequest<{ event: { id: string; name: string; type: string } }>(`/clubs/${clubId}/events`, {
      token,
      body,
    });
  },
  setAttendance(
    token: string,
    clubId: string,
    eventId: string,
    body: { playerId: string; status: string } | { status: "present" | "absent" | "maybe" },
  ) {
    return apiRequest<{ attendance: { status: string } }>(`/clubs/${clubId}/events/${eventId}/attendance`, {
      method: "PUT",
      token,
      body,
    });
  },
  createTransaction(
    token: string,
    clubId: string,
    body: { type: "income" | "expense"; amount: number; date: string; item: string; notes?: string },
  ) {
    return apiRequest<{ transaction: { id: string }; balance: string }>(`/clubs/${clubId}/transactions`, {
      token,
      body,
    });
  },
  async bootstrapManagerClub(prefix = "mgr") {
    const email = uniqueEmail(prefix);
    const password = "Password123!";
    await this.register({ email, name: `${prefix} Manager`, password });
    const loginRes = await this.login({ email, password });
    const { club } = await this.createClub(loginRes.token, {
      name: `${prefix.toUpperCase()} Club ${Date.now().toString().slice(-4)}`,
      description: "Automated E2E test club",
      goals: "Win the league",
    });
    return { email, password, token: loginRes.token, clubId: club.id, clubName: club.name, userId: loginRes.user.id };
  },
};
