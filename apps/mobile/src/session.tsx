import type { AuthUser } from "@myclub/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { readStored, removeStored, writeStored } from "./storage";

const TOKEN_KEY = "myclub_token";
const CLUB_KEY = "myclub_club";

type SessionValue = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  clubId: string | null;
  role: string | null;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
  setClubId: (clubId: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function pickClub(user: AuthUser, preferred?: string | null) {
  if (preferred && user.memberships.some((membership) => membership.clubId === preferred)) return preferred;
  return user.memberships[0]?.clubId ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clubId, setClubIdState] = useState<string | null>(null);

  const apply = useCallback(async (nextToken: string, nextUser: AuthUser, preferred?: string | null) => {
    const nextClub = pickClub(nextUser, preferred);
    await writeStored(TOKEN_KEY, nextToken);
    if (nextClub) await writeStored(CLUB_KEY, nextClub);
    else await removeStored(CLUB_KEY);
    setToken(nextToken);
    setUser(nextUser);
    setClubIdState(nextClub);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readStored(TOKEN_KEY);
      const savedClub = await readStored(CLUB_KEY);
      if (!saved) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const { user: next } = await api.me(saved);
        if (!cancelled) await apply(saved, next, savedClub);
      } catch {
        await removeStored(TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setClubIdState(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const signIn = useCallback(
    async (nextToken: string, nextUser: AuthUser) => {
      await apply(nextToken, nextUser);
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    await removeStored(TOKEN_KEY);
    await removeStored(CLUB_KEY);
    setToken(null);
    setUser(null);
    setClubIdState(null);
  }, []);

  const setClubId = useCallback(async (next: string) => {
    await writeStored(CLUB_KEY, next);
    setClubIdState(next);
  }, []);

  const role = user?.memberships.find((membership) => membership.clubId === clubId)?.role ?? null;

  const value = useMemo(
    () => ({ ready, token, user, clubId, role, signIn, signOut, setClubId }),
    [ready, token, user, clubId, role, signIn, signOut, setClubId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session missing");
  return value;
}
