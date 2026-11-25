"use client";

import { Field } from "@/components/Field";
import { api } from "@/lib/api";
import { notifyDanger } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { clubWriteSchema, registerSchema } from "@myclub/shared";
import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const steps = [
  { id: "name", label: "Your name" },
  { id: "email", label: "Email" },
  { id: "password", label: "Password" },
  { id: "club", label: "Club name" },
  { id: "description", label: "Description" },
  { id: "goals", label: "Goals" },
  { id: "logo", label: "Club logo" },
] as const;

export default function RegisterPage() {
  const session = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clubName, setClubName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const current = steps[step];
  const last = step === steps.length - 1;

  function validateStep() {
    if (current.id === "name" || current.id === "email" || current.id === "password") {
      const account = registerSchema.safeParse({
        name: current.id === "name" ? name : name || "Placeholder",
        email: current.id === "email" ? email : email || "placeholder@example.com",
        password: current.id === "password" ? password : password || "placeholder",
      });
      if (current.id === "name" && !name.trim()) return "Name is required.";
      if (current.id === "email") {
        const check = registerSchema.shape.email.safeParse(email);
        if (!check.success) return check.error.issues[0]?.message ?? "Enter a valid email.";
      }
      if (current.id === "password") {
        if (!password) return "Password is required.";
        const check = registerSchema.shape.password.safeParse(password);
        if (!check.success) return check.error.issues[0]?.message ?? "Password is required.";
      }
      if (current.id === "name" && !account.success && name.trim()) {
        return account.error.issues.find((issue) => issue.path[0] === "name")?.message ?? "Name is required.";
      }
    }
    if (current.id === "club") {
      const club = clubWriteSchema.shape.name.safeParse(clubName);
      if (!club.success) return club.error.issues[0]?.message ?? "Club name is required.";
    }
    if (current.id === "description") {
      const check = clubWriteSchema.shape.description.safeParse(description);
      if (!check.success) return check.error.issues[0]?.message ?? "Description is too long.";
    }
    if (current.id === "goals") {
      const check = clubWriteSchema.shape.goals.safeParse(goals);
      if (!check.success) return check.error.issues[0]?.message ?? "Goals are too long.";
    }
    if (current.id === "logo" && logo && logo.type !== "image/jpeg" && logo.type !== "image/png") {
      return "Unsupported format";
    }
    return null;
  }

  function onNext() {
    const message = validateStep();
    if (message) {
      setError(message);
      notifyDanger(message);
      return;
    }
    setError(null);
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function onCreate() {
    const message = validateStep();
    if (message) {
      setError(message);
      notifyDanger(message);
      return;
    }
    const account = registerSchema.safeParse({ name, email, password });
    if (!account.success) {
      const issue = account.error.issues[0]?.message ?? "Check the form and try again.";
      setError(issue);
      notifyDanger(issue);
      return;
    }
    const club = clubWriteSchema.safeParse({ name: clubName, description, goals });
    if (!club.success) {
      const issue = club.error.issues[0]?.message ?? "Check the club details.";
      setError(issue);
      notifyDanger(issue);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.register(account.data);
      const login = await api.login({ email: account.data.email, password: account.data.password });
      const created = await api.createClub(login.token, club.data);
      if (logo) await api.uploadLogo(login.token, created.club.id, logo);
      session.signIn(login.token, created.user, created.club.id);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the club.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (last) void onCreate();
          else onNext();
        }}
      >
        <div>
          <p className="eyebrow">MYCLUB</p>
          <h1>Create a club</h1>
        </div>
        <p className="muted">
          Step {step + 1} of {steps.length}. Nothing is saved until you finish.
        </p>
        {current.id === "name" ? (
          <Field label="Your name">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        ) : null}
        {current.id === "email" ? (
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        ) : null}
        {current.id === "password" ? (
          <Field label="Password">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        ) : null}
        {current.id === "club" ? (
          <Field label="Club name">
            <input value={clubName} onChange={(event) => setClubName(event.target.value)} />
          </Field>
        ) : null}
        {current.id === "description" ? (
          <Field label="Description">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        ) : null}
        {current.id === "goals" ? (
          <Field label="Goals">
            <textarea value={goals} onChange={(event) => setGoals(event.target.value)} />
          </Field>
        ) : null}
        {current.id === "logo" ? (
          <Field label="Club logo">
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
            />
          </Field>
        ) : null}
        <div className="row">
          {step > 0 ? (
            <Button type="button" variant="ghost" onPress={() => setStep((value) => value - 1)}>
              Back
            </Button>
          ) : null}
          <Button type="submit" isPending={pending}>
            {last ? (pending ? "Creating…" : "Create club") : "Next"}
          </Button>
        </div>
        <p className="muted">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
