"use client";

import { Field } from "@/components/Field";
import { api } from "@/lib/api";
import { notifyDanger, notifyWelcome, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { loginSchema } from "@myclub/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session.status !== "in") return;
    router.replace(session.role === "player" ? "/play" : "/dashboard");
  }, [session.status, session.role, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the form and try again.";
      setError(message);
      notifyZod(parsed.error, message);
      return;
    }
    setPending(true);
    try {
      const result = await api.login(parsed.data);
      session.signIn(result.token, result.user);
      const clubId = result.user.memberships[0]?.clubId ?? null;
      const role = result.user.memberships[0]?.role;
      await notifyWelcome(result.token, result.user, clubId);
      router.push(role === "player" ? "/play" : "/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">MYCLUB</p>
          <h1>Sign in</h1>
        </div>
        <p className="muted">Managers run the club on the web. Players reply to training and matches.</p>
        <Field label="Email">
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted">
          New club? <Link href="/register">Create one</Link>
        </p>
      </form>
    </main>
  );
}
