"use client";

import { api } from "@/lib/api";
import { validateWithSchema } from "@/lib/fieldValidation";
import { notifyAnnouncements, notifyDanger, notifyStatusNotices, notifyWelcome, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { loginSchema } from "@myclub/shared";
import { Button, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LoginFieldErrors = {
  email?: string;
  password?: string;
};

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session.status !== "in") return;
    router.replace(session.role === "player" ? "/play" : "/dashboard");
  }, [session.status, session.role, router]);

  function validateField(field: keyof LoginFieldErrors, value: string): string | null {
    if (field === "email") return validateWithSchema(loginSchema.shape.email, value);
    return validateWithSchema(loginSchema.shape.password, value);
  }

  function updateFieldError(field: keyof LoginFieldErrors, message: string | null) {
    setFieldErrors((current) => {
      if (!message) {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      }
      return { ...current, [field]: message };
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const emailError = validateField("email", email);
    const passwordError = validateField("password", password);
    setFieldErrors({
      ...(emailError ? { email: emailError } : {}),
      ...(passwordError ? { password: passwordError } : {}),
    });
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the form and try again.";
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
      if (result.user.memberships.some((membership) => membership.role === "manager")) {
        await notifyStatusNotices(result.token);
      }
      await notifyAnnouncements(result.token);
      router.push(role === "player" ? "/play" : "/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed.";
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-wrap">
      <Form className="auth-card" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">MYCLUB</p>
          <h1>Sign in</h1>
        </div>
        <p className="muted">Managers run the club on the web. Players reply to training and matches.</p>
        <TextField
          name="email"
          type="email"
          isInvalid={Boolean(fieldErrors.email)}
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (fieldErrors.email) updateFieldError("email", validateField("email", value));
          }}
          onBlur={() => updateFieldError("email", validateField("email", email))}
        >
          <Label>Email</Label>
          <Input autoComplete="email" />
          <FieldError>{fieldErrors.email}</FieldError>
        </TextField>
        <TextField
          name="password"
          type="password"
          isInvalid={Boolean(fieldErrors.password)}
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (fieldErrors.password) updateFieldError("password", validateField("password", value));
          }}
          onBlur={() => updateFieldError("password", validateField("password", password))}
        >
          <Label>Password</Label>
          <Input autoComplete="current-password" />
          <FieldError>{fieldErrors.password}</FieldError>
        </TextField>
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="muted">
          New club? <Link href="/register">Create one</Link>
        </p>
      </Form>
    </main>
  );
}
