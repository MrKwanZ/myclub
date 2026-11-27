"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { PlayerStatusMenu } from "@/components/PlayerStatusMenu";
import { api } from "@/lib/api";
import { notifySignedOut, notifySignOutFailed } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { managesClub, roleLabel, userInitials } from "@myclub/shared";
import {
  ArrowRightFromSquare,
  Calendar,
  ChartColumnStacked,
  CircleDollar,
  House,
  Person,
  ShieldKeyhole,
} from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Avatar, Button, Description, Label } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const managerLinks = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/roster", label: "Roster", icon: Person },
  { href: "/calendar", label: "Matches", icon: Calendar },
  { href: "/lineup", label: "Lineup", icon: ChartColumnStacked },
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
  const adminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const manages = managesClub(session.role);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutHovered, setSignOutHovered] = useState(false);
  const [adminLogoUrl, setAdminLogoUrl] = useState("");

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
    if (!session.isAdmin || !session.token || !session.clubId) {
      setAdminLogoUrl("");
      return;
    }
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .club(token, clubId)
      .then((result) => {
        if (!cancelled) setAdminLogoUrl(result.club.logoUrl);
      })
      .catch(() => {
        if (!cancelled) setAdminLogoUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [session.isAdmin, session.token, session.clubId]);

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "anon") {
      router.replace("/login");
      return;
    }
    if (session.role === "player" && !playerPath) {
      router.replace("/play");
      return;
    }
    if (manages && playerPath) {
      router.replace("/dashboard");
      return;
    }
    if (adminPath && !session.isAdmin) router.replace(session.role === "player" ? "/play" : "/dashboard");
  }, [session.status, session.role, session.isAdmin, playerPath, adminPath, manages, router]);

  if (session.status !== "in") {
    return (
      <main className="auth-wrap">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const mismatch =
    (session.role === "player" && !playerPath) ||
    (manages && playerPath) ||
    (adminPath && !session.isAdmin);
  if (mismatch) {
    return (
      <main className="auth-wrap">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const clubs = session.user
    ? session.isAdmin
      ? session.user.clubs
      : session.user.memberships.map((item) => item.club)
    : [];
  const currentClub = clubs.find((club) => club.id === session.clubId);
  const logoUrl = session.isAdmin ? adminLogoUrl : currentClub?.logoUrl;
  const showClubMenu = session.isAdmin ? clubs.length > 0 : clubs.length > 1;
  const links = session.role === "player" ? playerLinks : managerLinks;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {logoUrl ? (
            <img className="club-logo" src={logoUrl} alt={`${currentClub?.name ?? "Club"} logo`} />
          ) : (
            <span className="club-logo club-logo-empty">Logo</span>
          )}
        </div>
        {showClubMenu ? (
          <div className="field club-switch" data-testid="club-switcher">
            <span>Club</span>
            <ChoiceMenu
              label="Club"
              value={session.clubId ?? ""}
              options={clubs.map((club) => ({
                id: club.id,
                label: club.name,
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
        <nav className="nav" aria-label="Account">
          {manages && session.user ? (
            <Button
              className={pathname === "/account" ? "account-link nav-current" : "account-link"}
              data-testid="account-link"
              variant="ghost"
              onPress={() => router.push("/account")}
            >
              <Avatar size="sm">
                {session.user.avatarUrl ? <Avatar.Image alt="" src={session.user.avatarUrl} /> : null}
                <Avatar.Fallback>{userInitials(session.user.name)}</Avatar.Fallback>
              </Avatar>
              <span className="account-link-copy">
                <Label>{session.user.name}</Label>
                <Description>{roleLabel(session.role ?? "")}</Description>
              </span>
            </Button>
          ) : null}
          {session.isAdmin ? (
            <Button
              className={pathname === "/admin" ? "nav-current" : undefined}
              data-testid="admin-panel-link"
              variant="ghost"
              onPress={() => router.push("/admin")}
            >
              <Icon data={ShieldKeyhole} size={16} />
              Admin Panel
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
        </nav>
      </aside>
      <main className="main" key={session.clubId ?? "none"}>
        {children}
      </main>
      {session.role === "player" ? <PlayerStatusMenu /> : null}
    </div>
  );
}
