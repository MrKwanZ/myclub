"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MyAttendanceRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/play?tab=attendance");
  }, [router]);

  return <p className="muted">Loading…</p>;
}
