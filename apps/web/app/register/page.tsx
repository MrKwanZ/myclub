"use client";

import { api } from "@/lib/api";
import { notifyDanger } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { clubWriteSchema, registerSchema } from "@myclub/shared";
import { Button, FieldError, Form, Input, Label, TextArea, TextField } from "@heroui/react";
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

type StepId = (typeof steps)[number]["id"];

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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const current = steps[step];
  const last = step === steps.length - 1;

  function validateStepValue(
    stepId: StepId,
    overrides?: Partial<{
      name: string;
      email: string;
      password: string;
      clubName: string;
      description: string;
      goals: string;
      logo: File | null;
    }>,
  ): string | null {
    const nextName = overrides?.name ?? name;
    const nextEmail = overrides?.email ?? email;
    const nextPassword = overrides?.password ?? password;
    const nextClubName = overrides?.clubName ?? clubName;
    const nextDescription = overrides?.description ?? description;
    const nextGoals = overrides?.goals ?? goals;
    const nextLogo = overrides && "logo" in overrides ? (overrides.logo ?? null) : logo;

    if (stepId === "name") {
      if (!nextName.trim()) return "Name is required.";
      const check = registerSchema.shape.name.safeParse(nextName);
      if (!check.success) return check.error.issues[0]?.message ?? "Name is required.";
    }
    if (stepId === "email") {
      const check = registerSchema.shape.email.safeParse(nextEmail);
      if (!check.success) return check.error.issues[0]?.message ?? "Enter a valid email.";
    }
    if (stepId === "password") {
      if (!nextPassword) return "Password is required.";
      const check = registerSchema.shape.password.safeParse(nextPassword);
      if (!check.success) return check.error.issues[0]?.message ?? "Password is required.";
    }
    if (stepId === "club") {
      const club = clubWriteSchema.shape.name.safeParse(nextClubName);
      if (!club.success) return club.error.issues[0]?.message ?? "Club name is required.";
    }
    if (stepId === "description") {
      const check = clubWriteSchema.shape.description.safeParse(nextDescription);
      if (!check.success) return check.error.issues[0]?.message ?? "Description is too long.";
    }
    if (stepId === "goals") {
      const check = clubWriteSchema.shape.goals.safeParse(nextGoals);
      if (!check.success) return check.error.issues[0]?.message ?? "Goals are too long.";
    }
    if (stepId === "logo" && nextLogo && nextLogo.type !== "image/jpeg" && nextLogo.type !== "image/png") {
      return "Unsupported format, please upload a valid image";
    }
    return null;
  }

  function onNext() {
    const message = validateStepValue(current.id);
    if (message) {
      setFieldError(message);
      notifyDanger(message);
      return;
    }
    setFieldError(null);
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function onCreate() {
    const message = validateStepValue(current.id);
    if (message) {
      setFieldError(message);
      notifyDanger(message);
      return;
    }
    const account = registerSchema.safeParse({ name, email, password });
    if (!account.success) {
      const issue = account.error.issues[0]?.message ?? "Check the form and try again.";
      setFieldError(issue);
      notifyDanger(issue);
      return;
    }
    const club = clubWriteSchema.safeParse({ name: clubName, description, goals });
    if (!club.success) {
      const issue = club.error.issues[0]?.message ?? "Check the club details.";
      setFieldError(issue);
      notifyDanger(issue);
      return;
    }
    setPending(true);
    setFieldError(null);
    try {
      await api.register(account.data);
      const login = await api.login({ email: account.data.email, password: account.data.password });
      const created = await api.createClub(login.token, club.data);
      if (logo) await api.uploadLogo(login.token, created.club.id, logo);
      session.signIn(login.token, created.user, created.club.id);
      router.push("/dashboard");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Could not create the club.";
      setFieldError(errMsg);
      notifyDanger(errMsg);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-wrap">
      <Form
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
          <TextField
            name="name"
            isInvalid={Boolean(fieldError)}
            value={name}
            onChange={(value) => {
              setName(value);
              if (fieldError) setFieldError(validateStepValue("name", { name: value }));
            }}
            onBlur={() => setFieldError(validateStepValue("name"))}
          >
            <Label>Your name</Label>
            <Input />
            <FieldError>{fieldError}</FieldError>
          </TextField>
        ) : null}
        {current.id === "email" ? (
          <TextField
            name="email"
            type="email"
            isInvalid={Boolean(fieldError)}
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (fieldError) setFieldError(validateStepValue("email", { email: value }));
            }}
            onBlur={() => setFieldError(validateStepValue("email"))}
          >
            <Label>Email</Label>
            <Input autoComplete="email" />
            <FieldError>{fieldError}</FieldError>
          </TextField>
        ) : null}
        {current.id === "password" ? (
          <TextField
            name="password"
            type="password"
            isInvalid={Boolean(fieldError)}
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (fieldError) setFieldError(validateStepValue("password", { password: value }));
            }}
            onBlur={() => setFieldError(validateStepValue("password"))}
          >
            <Label>Password</Label>
            <Input autoComplete="new-password" />
            <FieldError>{fieldError}</FieldError>
          </TextField>
        ) : null}
        {current.id === "club" ? (
          <TextField
            name="clubName"
            isInvalid={Boolean(fieldError)}
            value={clubName}
            onChange={(value) => {
              setClubName(value);
              if (fieldError) setFieldError(validateStepValue("club", { clubName: value }));
            }}
            onBlur={() => setFieldError(validateStepValue("club"))}
          >
            <Label>Club name</Label>
            <Input />
            <FieldError>{fieldError}</FieldError>
          </TextField>
        ) : null}
        {current.id === "description" ? (
          <TextField
            name="description"
            isInvalid={Boolean(fieldError)}
            value={description}
            onChange={(value) => {
              setDescription(value);
              if (fieldError) setFieldError(validateStepValue("description", { description: value }));
            }}
            onBlur={() => setFieldError(validateStepValue("description"))}
          >
            <Label>Description</Label>
            <TextArea />
            <FieldError>{fieldError}</FieldError>
          </TextField>
        ) : null}
        {current.id === "goals" ? (
          <TextField
            name="goals"
            isInvalid={Boolean(fieldError)}
            value={goals}
            onChange={(value) => {
              setGoals(value);
              if (fieldError) setFieldError(validateStepValue("goals", { goals: value }));
            }}
            onBlur={() => setFieldError(validateStepValue("goals"))}
          >
            <Label>Goals</Label>
            <TextArea />
            <FieldError>{fieldError}</FieldError>
          </TextField>
        ) : null}
        {current.id === "logo" ? (
          <div className="field" data-invalid={fieldError ? "true" : undefined}>
            <Label htmlFor="register-logo">Club logo</Label>
            <input
              id="register-logo"
              type="file"
              accept="image/jpeg,image/png"
              aria-invalid={Boolean(fieldError)}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setLogo(file);
                setFieldError(validateStepValue("logo", { logo: file }));
              }}
            />
            {fieldError ? (
              <span className="field-error" role="alert">
                {fieldError}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="row">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onPress={() => {
                setFieldError(null);
                setStep((value) => value - 1);
              }}
            >
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
      </Form>
    </main>
  );
}
