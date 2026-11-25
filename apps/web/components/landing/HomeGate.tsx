"use client";

import { useSession } from "@/lib/session";
import { TOKEN_KEY } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { LandingPage } from "./LandingPage";
import "./landing.css";

function LandingSkeleton() {
  return (
    <div className="lp lp-auth-hold" aria-busy="true">
      <p className="lp-sr">Loading your club</p>
      <div className="lp-nav-wrap">
        <div className="lp-skeleton lp-skeleton-nav" />
      </div>
      <div className="lp-wrap lp-hero-section">
        <div className="lp-skeleton-copy">
          <div className="lp-skeleton lp-skeleton-line lp-skeleton-line-lg" />
          <div className="lp-skeleton lp-skeleton-line" />
          <div className="lp-skeleton lp-skeleton-line lp-skeleton-line-sm" />
          <div className="lp-skeleton lp-skeleton-button" />
        </div>
      </div>
    </div>
  );
}

export function HomeGate() {
  const session = useSession();
  const router = useRouter();

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(TOKEN_KEY)) document.documentElement.classList.add("mc-auth");
    } catch {
      document.documentElement.classList.remove("mc-auth");
    }
  }, []);

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "in") {
      router.replace(session.role === "player" ? "/play" : "/dashboard");
      return;
    }
    document.documentElement.classList.remove("mc-auth");
  }, [session.status, session.role, router]);

  return (
    <>
      <LandingSkeleton />
      <div className="lp-guest">
        <LandingPage />
      </div>
    </>
  );
}
