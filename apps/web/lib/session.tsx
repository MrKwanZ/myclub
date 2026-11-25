"use client";

import type { AuthUser } from "@myclub/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { CLUB_KEY, TOKEN_KEY } from "./storage";

type Status = "loading" | "anon" | "in";

type SessionValue = {
  status: Status;
  token: string | null;
  user: AuthUser | null;
  clubId: string | null;
  role: string | null;
  signIn: (token: string, user: AuthUser, clubId?: string) => void;
  signOut: () => void;
  setClubId: (clubId: string) => void;
  refresh: () => Promise<AuthUser | null>;
};

const SessionContext = createContext<SessionValue | null>(null);

function pickClub(user: AuthUser, preferred?: string | null) {
  if (preferred && user.memberships.some((membership) => membership.clubId === preferred)) return preferred;
  return user.memberships[0]?.clubId ?? null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clubId, setClubIdState] = useState<string | null>(null);

  const applyUser = useCallback((nextToken: string, nextUser: AuthUser, preferred?: string | null) => {
    const nextClub = pickClub(nextUser, preferred);
    localStorage.setItem(TOKEN_KEY, nextToken);
    if (nextClub) localStorage.setItem(CLUB_KEY, nextClub);
    else localStorage.removeItem(CLUB_KEY);
    setToken(nextToken);
    setUser(nextUser);
    setClubIdState(nextClub);
    setStatus("in");
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CLUB_KEY);
    setToken(null);
    setUser(null);
    setClubIdState(null);
    setStatus("anon");
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    const savedClub = localStorage.getItem(CLUB_KEY);
    if (!saved) {
      setStatus("anon");
      return;
    }
    api
      .me(saved)
      .then(({ user: next }) => applyUser(saved, next, savedClub))
      .catch(() => signOut());
  }, [applyUser, signOut]);

  const setClubId = useCallback((next: string) => {
    localStorage.setItem(CLUB_KEY, next);
    setClubIdState(next);
  }, []);

  const signIn = useCallback(
    (nextToken: string, nextUser: AuthUser, nextClubId?: string) => {
      applyUser(nextToken, nextUser, nextClubId);
    },
    [applyUser],
  );

  const refresh = useCallback(async () => {
    const current = token ?? localStorage.getItem(TOKEN_KEY);
    if (!current) {
      setStatus("anon");
      return null;
    }
    const { user: next } = await api.me(current);
    applyUser(current, next, clubId ?? localStorage.getItem(CLUB_KEY));
    return next;
  }, [token, clubId, applyUser]);

  const role = user?.memberships.find((membership) => membership.clubId === clubId)?.role ?? null;

  const value = useMemo(
    () => ({ status, token, user, clubId, role, signIn, signOut, setClubId, refresh }),
    [status, token, user, clubId, role, signIn, signOut, setClubId, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session missing");
  return value;
}
