"use client";

import { api } from "@/lib/api";
import { notifyDanger } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { clubWriteSchema, registerSchema } from "@myclub/shared";
import { ArrowRight } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Breadcrumbs,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  Spinner,
  Surface,
  TextArea,
  TextField,
} from "@heroui/react";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";

const steps = [
  { id: "personal", label: "Personal" },
  { id: "club", label: "Club" },
  { id: "confirm", label: "Confirm" },
  { id: "complete", label: "Complete" },
] as const;

type StepIndex = 0 | 1 | 2 | 3;

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "clubName" | "description" | "goals" | "logo" | "jerseys", string>
>;

const IMAGE_ERROR = "Unsupported format, please upload a valid image";

function isImageFile(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

function issueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

export default function RegisterPage() {
  const session = useSession();
  const [step, setStep] = useState<StepIndex>(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clubName, setClubName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [jerseys, setJerseys] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const jerseyPreviews = useMemo(() => jerseys.map((file) => URL.createObjectURL(file)), [jerseys]);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  useEffect(() => {
    return () => {
      jerseyPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [jerseyPreviews]);

  function personalErrors(overrides?: Partial<{ name: string; email: string; password: string }>): FieldErrors {
    const nextName = overrides?.name ?? name;
    const nextEmail = overrides?.email ?? email;
    const nextPassword = overrides?.password ?? password;
    const next: FieldErrors = {};
    const nameCheck = registerSchema.shape.name.safeParse(nextName);
    if (!nameCheck.success) next.name = issueMessage(nameCheck.error, "Name is required.");
    const emailCheck = registerSchema.shape.email.safeParse(nextEmail);
    if (!emailCheck.success) next.email = issueMessage(emailCheck.error, "Enter a valid email.");
    const passwordCheck = registerSchema.shape.password.safeParse(nextPassword);
    if (!passwordCheck.success) next.password = issueMessage(passwordCheck.error, "Password is required.");
    return next;
  }

  function clubErrors(overrides?: Partial<{ clubName: string; description: string; goals: string }>): FieldErrors {
    const nextClubName = overrides?.clubName ?? clubName;
    const nextDescription = overrides?.description ?? description;
    const nextGoals = overrides?.goals ?? goals;
    const next: FieldErrors = {};
    const nameCheck = clubWriteSchema.shape.name.safeParse(nextClubName);
    if (!nameCheck.success) next.clubName = issueMessage(nameCheck.error, "Club name is required.");
    const descriptionCheck = clubWriteSchema.shape.description.safeParse(nextDescription);
    if (!descriptionCheck.success) next.description = issueMessage(descriptionCheck.error, "Description is too long.");
    const goalsCheck = clubWriteSchema.shape.goals.safeParse(nextGoals);
    if (!goalsCheck.success) next.goals = issueMessage(goalsCheck.error, "Goals are too long.");
    if (logo && !isImageFile(logo)) next.logo = IMAGE_ERROR;
    if (jerseys.some((file) => !isImageFile(file))) next.jerseys = IMAGE_ERROR;
    if (jerseys.length > 12) next.jerseys = "Too many jerseys.";
    return next;
  }

  function showIssues(next: FieldErrors) {
    const message = Object.values(next).find(Boolean);
    if (message) notifyDanger(message);
    setErrors(next);
    return !message;
  }

  function onNextPersonal() {
    if (!showIssues(personalErrors())) return;
    setStep(1);
  }

  function onNextClub() {
    if (!showIssues(clubErrors())) return;
    setStep(2);
  }

  function openReachedStep(index: number) {
    if (pending || index >= step) return;
    setErrors({});
    setStep(index as StepIndex);
  }

  async function onCreate() {
    const accountIssues = personalErrors();
    const clubIssues = clubErrors();
    const nextErrors = { ...accountIssues, ...clubIssues };
    if (!showIssues(nextErrors)) {
      setStep(accountIssues.name || accountIssues.email || accountIssues.password ? 0 : 1);
      return;
    }
    const account = registerSchema.safeParse({ name, email, password });
    const club = clubWriteSchema.safeParse({ name: clubName, description, goals });
    if (!account.success || !club.success) return;

    setPending(true);
    setErrors({});
    try {
      await api.register(account.data);
      const login = await api.login({ email: account.data.email, password: account.data.password });
      const created = await api.createClub(login.token, club.data);
      if (logo) await api.uploadLogo(login.token, created.club.id, logo);
      for (const file of jerseys) {
        await api.uploadJersey(login.token, created.club.id, file);
      }
      session.signIn(login.token, created.user, created.club.id);
      setStep(3);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Could not create the club.";
      setErrors({ clubName: errMsg });
      notifyDanger(errMsg);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-wrap">
      <Surface className="register-surface" variant="default">
        <nav aria-label="Registration steps" className="register-crumbs">
          <Breadcrumbs>
            {steps.map((item, index) => {
              const reached = index < step;
              const future = index > step;
              return (
                <Breadcrumbs.Item
                  key={item.id}
                  aria-current={index === step ? "page" : "false"}
                  className={index === step ? "register-crumb-current" : undefined}
                  href={index === step ? undefined : "#"}
                  isDisabled={future || pending}
                  onClick={(event) => {
                    event.preventDefault();
                    if (reached && !pending) openReachedStep(index);
                  }}
                >
                  {item.label}
                </Breadcrumbs.Item>
              );
            })}
          </Breadcrumbs>
        </nav>

        <div className="register-columns">
          <div className="register-intro">
            <p className="eyebrow">MYCLUB</p>
            <h1>Create your club</h1>
            <p className="muted">Manage your club and players with ease.</p>
          </div>

          {step === 0 ? (
            <Form
              className="register-form"
              onSubmit={(event) => {
                event.preventDefault();
                onNextPersonal();
              }}
            >
              <TextField
                isInvalid={Boolean(errors.name)}
                name="name"
                value={name}
                onBlur={() => setErrors((current) => ({ ...current, name: personalErrors().name }))}
                onChange={(value) => {
                  setName(value);
                  if (errors.name) setErrors((current) => ({ ...current, name: personalErrors({ name: value }).name }));
                }}
              >
                <Label>Your name</Label>
                <Input />
                <FieldError>{errors.name}</FieldError>
              </TextField>
              <TextField
                isInvalid={Boolean(errors.email)}
                name="email"
                type="email"
                value={email}
                onBlur={() => setErrors((current) => ({ ...current, email: personalErrors().email }))}
                onChange={(value) => {
                  setEmail(value);
                  if (errors.email) setErrors((current) => ({ ...current, email: personalErrors({ email: value }).email }));
                }}
              >
                <Label>Email</Label>
                <Input autoComplete="email" />
                <FieldError>{errors.email}</FieldError>
              </TextField>
              <TextField
                isInvalid={Boolean(errors.password)}
                name="password"
                type="password"
                value={password}
                onBlur={() => setErrors((current) => ({ ...current, password: personalErrors().password }))}
                onChange={(value) => {
                  setPassword(value);
                  if (errors.password) {
                    setErrors((current) => ({ ...current, password: personalErrors({ password: value }).password }));
                  }
                }}
              >
                <Label>Password</Label>
                <Input autoComplete="new-password" />
                <FieldError>{errors.password}</FieldError>
              </TextField>
              <div className="register-actions">
                <Button type="submit">Next</Button>
              </div>
              <p className="muted">
                Already registered? <NextLink href="/login">Sign in</NextLink>
              </p>
            </Form>
          ) : null}

          {step === 1 ? (
            <Form
              className="register-form"
              onSubmit={(event) => {
                event.preventDefault();
                onNextClub();
              }}
            >
              <TextField
                isInvalid={Boolean(errors.clubName)}
                name="clubName"
                value={clubName}
                onBlur={() => setErrors((current) => ({ ...current, clubName: clubErrors().clubName }))}
                onChange={(value) => {
                  setClubName(value);
                  if (errors.clubName) {
                    setErrors((current) => ({ ...current, clubName: clubErrors({ clubName: value }).clubName }));
                  }
                }}
              >
                <Label>Club name</Label>
                <Input />
                <FieldError>{errors.clubName}</FieldError>
              </TextField>
              <TextField
                isInvalid={Boolean(errors.description)}
                name="description"
                value={description}
                onBlur={() => setErrors((current) => ({ ...current, description: clubErrors().description }))}
                onChange={(value) => {
                  setDescription(value);
                  if (errors.description) {
                    setErrors((current) => ({
                      ...current,
                      description: clubErrors({ description: value }).description,
                    }));
                  }
                }}
              >
                <Label>Description</Label>
                <TextArea />
                <FieldError>{errors.description}</FieldError>
              </TextField>
              <TextField
                isInvalid={Boolean(errors.goals)}
                name="goals"
                value={goals}
                onBlur={() => setErrors((current) => ({ ...current, goals: clubErrors().goals }))}
                onChange={(value) => {
                  setGoals(value);
                  if (errors.goals) setErrors((current) => ({ ...current, goals: clubErrors({ goals: value }).goals }));
                }}
              >
                <Label>Goals</Label>
                <TextArea />
                <FieldError>{errors.goals}</FieldError>
              </TextField>
              <div className="field" data-invalid={errors.logo ? "true" : undefined}>
                <Label htmlFor="register-logo">Club logo</Label>
                <input
                  accept="image/jpeg,image/png"
                  aria-invalid={Boolean(errors.logo)}
                  id="register-logo"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    if (file && !isImageFile(file)) {
                      setErrors((current) => ({ ...current, logo: IMAGE_ERROR }));
                      notifyDanger(IMAGE_ERROR);
                      return;
                    }
                    setLogo(file);
                    setErrors((current) => ({ ...current, logo: undefined }));
                  }}
                />
                {logo ? <span className="muted">{logo.name}</span> : null}
                {errors.logo ? (
                  <span className="field-error" role="alert">
                    {errors.logo}
                  </span>
                ) : null}
              </div>
              <div className="field" data-invalid={errors.jerseys ? "true" : undefined}>
                <Label htmlFor="register-jerseys">Jerseys</Label>
                <input
                  accept="image/jpeg,image/png"
                  aria-invalid={Boolean(errors.jerseys)}
                  id="register-jerseys"
                  multiple
                  type="file"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.some((file) => !isImageFile(file))) {
                      setErrors((current) => ({ ...current, jerseys: IMAGE_ERROR }));
                      notifyDanger(IMAGE_ERROR);
                      return;
                    }
                    const next = [...jerseys, ...files];
                    if (next.length > 12) {
                      setErrors((current) => ({ ...current, jerseys: "Too many jerseys." }));
                      notifyDanger("Too many jerseys.");
                      return;
                    }
                    setJerseys(next);
                    setErrors((current) => ({ ...current, jerseys: undefined }));
                  }}
                />
                {jerseys.length > 0 ? (
                  <ul className="stack-tight">
                    {jerseys.map((file, index) => (
                      <li key={`${file.name}-${index}`}>{file.name}</li>
                    ))}
                  </ul>
                ) : null}
                {errors.jerseys ? (
                  <span className="field-error" role="alert">
                    {errors.jerseys}
                  </span>
                ) : null}
              </div>
              <div className="register-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onPress={() => {
                    setErrors({});
                    setStep(0);
                  }}
                >
                  Back
                </Button>
                <Button type="submit">Next</Button>
              </div>
            </Form>
          ) : null}

          {step === 2 ? (
            <Form
              className="register-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!pending) void onCreate();
              }}
            >
              <dl className="register-summary">
                <div>
                  <dt>Your name</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{email}</dd>
                </div>
                <div>
                  <dt>Club name</dt>
                  <dd>{clubName}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{description.trim() || "None"}</dd>
                </div>
                <div>
                  <dt>Goals</dt>
                  <dd>{goals.trim() || "None"}</dd>
                </div>
                <div>
                  <dt>Club logo</dt>
                  <dd>
                    {logo && logoPreview ? (
                      <img alt="Club logo preview" className="club-logo" src={logoPreview} />
                    ) : (
                      "None"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Jerseys</dt>
                  <dd>
                    {jerseyPreviews.length > 0 ? (
                      <div className="jersey-settings-list">
                        {jerseyPreviews.map((url, index) => (
                          <img
                            key={url}
                            alt={jerseys[index]?.name ?? `Jersey ${index + 1}`}
                            className="jersey-settings-thumb"
                            src={url}
                          />
                        ))}
                      </div>
                    ) : (
                      "None"
                    )}
                  </dd>
                </div>
              </dl>
              {errors.clubName ? (
                <span className="field-error" role="alert">
                  {errors.clubName}
                </span>
              ) : null}
              <div className="register-actions">
                {pending ? (
                  <div className="register-pending">
                    <Spinner size="sm" />
                    <span>Creating your club…</span>
                  </div>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onPress={() => {
                        setErrors({});
                        setStep(1);
                      }}
                    >
                      Back
                    </Button>
                    <Button type="submit">Create club</Button>
                  </>
                )}
              </div>
            </Form>
          ) : null}

          {step === 3 ? (
            <div className="register-form">
              <p className="register-complete">
                Good news! You have created your club.{" "}
                <Link href="/dashboard">
                  Start managing your club
                  <Link.Icon />
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </Surface>
    </main>
  );
}
