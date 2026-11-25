"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ClubPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings");
  }, [router]);

  return (
    <p className="muted">Opening settings…</p>
  );
}
