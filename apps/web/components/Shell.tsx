"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { PlayerStatusMenu } from "@/components/PlayerStatusMenu";
import { notifySignedOut, notifySignOutFailed } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { ArrowRightFromSquare, Calendar, CircleDollar, Gear, House, Person } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Button } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const managerLinks = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/roster", label: "Roster", icon: Person },
  { href: "/calendar", label: "Matches", icon: Calendar },
  { href: "/finance", label: "Finance", icon: CircleDollar },
] as const;

const playerLinks = [
  { href: "/play", label: "Dashboard", icon: House },
  { href: "/play/calendar", label: "Matches", icon: Calendar },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const playerPath = pathname.startsWith("/play");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutHovered, setSignOutHovered] = useState(false);

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      session.signOut();
      notifySignedOut();
    } catch {
      notifySignOutFailed();
      setSigningOut(false);
    }
  }

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "anon") {
      router.replace("/login");
      return;
    }
    if (!session.role) return;
    if (session.role === "player" && !playerPath) router.replace("/play");
    if (session.role === "manager" && playerPath) router.replace("/dashboard");
  }, [session.status, session.role, playerPath, router]);

  if (session.status !== "in") {
    return (
      <main className="auth-wrap">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const mismatch =
    (session.role === "player" && !playerPath) || (session.role === "manager" && playerPath);
  if (mismatch) {
    return (
      <main className="auth-wrap">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const membership = session.user?.memberships.find((item) => item.clubId === session.clubId);
  const links = session.role === "player" ? playerLinks : managerLinks;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {membership?.club.logoUrl ? (
            <img className="club-logo" src={membership.club.logoUrl} alt={`${membership.club.name} logo`} />
          ) : (
            <span className="club-logo club-logo-empty">Logo</span>
          )}
        </div>
        {session.user && session.user.memberships.length > 1 ? (
          <div className="field club-switch" data-testid="club-switcher">
            <span>Club</span>
            <ChoiceMenu
              label="Club"
              value={session.clubId ?? ""}
              options={session.user.memberships.map((item) => ({
                id: item.clubId,
                label: item.club.name,
              }))}
              onChange={session.setClubId}
            />
          </div>
        ) : null}
        <nav className="nav" aria-label="Club">
          {session.role
            ? links.map((link) => (
                <Button
                  key={link.href}
                  variant="ghost"
                  className={pathname === link.href ? "nav-current" : undefined}
                  onPress={() => router.push(link.href)}
                >
                  {"icon" in link ? <Icon data={link.icon} size={16} /> : null}
                  {link.label}
                </Button>
              ))
            : null}
        </nav>
        <div className="spacer" />
        {session.role === "manager" ? (
          <Button
            className={pathname === "/settings" ? "nav-current" : undefined}
            variant="ghost"
            onPress={() => router.push("/settings")}
          >
            <Icon data={Gear} size={16} />
            Settings
          </Button>
        ) : null}
        <Button
          className="sign-out"
          variant={signOutHovered ? "danger-soft" : "ghost"}
          onMouseEnter={() => setSignOutHovered(true)}
          onMouseLeave={() => setSignOutHovered(false)}
          onPress={() => void onSignOut()}
        >
          <Icon data={ArrowRightFromSquare} size={16} />
          {signingOut ? "Signing out…" : "Sign Out"}
        </Button>
      </aside>
      <main className="main" key={session.clubId ?? "none"}>
        {children}
      </main>
      {session.role === "player" ? <PlayerStatusMenu /> : null}
    </div>
  );
}
