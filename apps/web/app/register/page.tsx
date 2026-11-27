"use client";

import { api, ApiError } from "@/lib/api";
import { notifyDanger } from "@/lib/notify";
import { useSession } from "@/lib/session";
import {
  clubWriteSchema,
  csvImportBlocked,
  parseClubCsv,
  parsedImportValues,
  registerSchema,
  type AuthUser,
  type ClubImport,
  type ClubImportPlayer,
  type CsvImportKind,
  type EventWrite,
  type ParsedClubCsv,
  type TransactionWrite,
} from "@myclub/shared";
import { Xmark } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Breadcrumbs,
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  Spinner,
  Surface,
  Table,
  TextArea,
  TextField,
} from "@heroui/react";
import NextLink from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

const stepLabels = {
  personal: "Personal",
  club: "Club",
  roster: "Roster",
  finance: "Finance",
  events: "Events",
  confirm: "Confirm",
  complete: "Complete",
} as const;

type StepId = keyof typeof stepLabels;
const previewStepIds = ["roster", "finance", "events"] as const;
type PreviewStepId = (typeof previewStepIds)[number];

type FieldErrors = Partial<
  Record<
    "name" | "email" | "password" | "clubName" | "description" | "goals" | "logo" | "jerseys" | "rosterCsv" | "financeCsv" | "eventsCsv",
    string
  >
>;

type CsvUpload = { file: File; parsed: ParsedClubCsv };

type CreatedClub = {
  token: string;
  user: AuthUser;
  clubId: string;
  mediaUploaded: boolean;
  imported: boolean;
};

const csvCopy: Record<
  PreviewStepId,
  { label: string; button: string; missing: string; summary: string; errorKey: "rosterCsv" | "financeCsv" | "eventsCsv" }
> = {
  roster: {
    label: "I have a club roster",
    button: "Upload roster CSV",
    missing: "Upload a roster CSV.",
    summary: "Roster CSV",
    errorKey: "rosterCsv",
  },
  finance: {
    label: "I have a club financial table",
    button: "Upload financial table CSV",
    missing: "Upload a financial table CSV.",
    summary: "Financial table CSV",
    errorKey: "financeCsv",
  },
  events: {
    label: "I have a club event schedule",
    button: "Upload event schedule CSV",
    missing: "Upload an event schedule CSV.",
    summary: "Event schedule CSV",
    errorKey: "eventsCsv",
  },
};

const IMAGE_ERROR = "Unsupported format, please upload a valid image";
const CSV_ERROR = "Upload a CSV file.";
const ROW_ERROR = "Fix the highlighted rows before continuing.";

function isImageFile(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function isPreviewStep(stepId: StepId): stepId is PreviewStepId {
  return (previewStepIds as readonly string[]).includes(stepId);
}

function issueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

export default function RegisterPage() {
  const session = useSession();
  const [stepId, setStepId] = useState<StepId>("personal");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clubName, setClubName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [jerseys, setJerseys] = useState<File[]>([]);
  const [hasRoster, setHasRoster] = useState(false);
  const [hasFinance, setHasFinance] = useState(false);
  const [hasEvents, setHasEvents] = useState(false);
  const [rosterCsv, setRosterCsv] = useState<CsvUpload | null>(null);
  const [financeCsv, setFinanceCsv] = useState<CsvUpload | null>(null);
  const [eventsCsv, setEventsCsv] = useState<CsvUpload | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const jerseyInput = useRef<HTMLInputElement>(null);
  const rosterInput = useRef<HTMLInputElement>(null);
  const financeInput = useRef<HTMLInputElement>(null);
  const eventsInput = useRef<HTMLInputElement>(null);
  const createdRef = useRef<CreatedClub | null>(null);

  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const jerseyPreviews = useMemo(() => jerseys.map((file) => URL.createObjectURL(file)), [jerseys]);
  const steps = useMemo(() => {
    const ids: StepId[] = ["personal", "club"];
    if (hasRoster) ids.push("roster");
    if (hasFinance) ids.push("finance");
    if (hasEvents) ids.push("events");
    ids.push("confirm", "complete");
    return ids;
  }, [hasRoster, hasFinance, hasEvents]);
  const stepIndex = Math.max(0, steps.indexOf(stepId));
  const uploads: Record<PreviewStepId, CsvUpload | null> = {
    roster: rosterCsv,
    finance: financeCsv,
    events: eventsCsv,
  };

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

  useEffect(() => {
    if (!steps.includes(stepId)) setStepId("club");
  }, [steps, stepId]);

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
    if (hasRoster && !rosterCsv) next.rosterCsv = csvCopy.roster.missing;
    if (hasFinance && !financeCsv) next.financeCsv = csvCopy.finance.missing;
    if (hasEvents && !eventsCsv) next.eventsCsv = csvCopy.events.missing;
    return next;
  }

  function showIssues(next: FieldErrors) {
    const message = Object.values(next).find(Boolean);
    if (message) notifyDanger(message);
    setErrors(next);
    return !message;
  }

  function blockingPreview(): PreviewStepId | null {
    if (hasRoster && csvImportBlocked(rosterCsv?.parsed ?? null)) return "roster";
    if (hasFinance && csvImportBlocked(financeCsv?.parsed ?? null)) return "finance";
    if (hasEvents && csvImportBlocked(eventsCsv?.parsed ?? null)) return "events";
    return null;
  }

  function goTo(next: StepId) {
    setErrors({});
    setStepId(next);
  }

  function onNextPersonal() {
    if (!showIssues(personalErrors())) return;
    goTo("club");
  }

  function onNextClub() {
    if (!showIssues(clubErrors())) return;
    const next = steps[steps.indexOf("club") + 1];
    if (next && next !== "complete") goTo(next);
  }

  function onNextPreview(current: PreviewStepId) {
    if (csvImportBlocked(uploads[current]?.parsed ?? null)) {
      notifyDanger(uploads[current]?.parsed.fileError ?? ROW_ERROR);
      return;
    }
    const next = steps[steps.indexOf(current) + 1];
    if (next && next !== "complete") goTo(next);
  }

  function openReachedStep(index: number) {
    if (pending || index >= stepIndex) return;
    const blocked = blockingPreview();
    const blockedIndex = blocked ? steps.indexOf(blocked) : -1;
    if (blocked && blockedIndex !== -1 && index > blockedIndex) {
      notifyDanger(uploads[blocked]?.parsed.fileError ?? ROW_ERROR);
      goTo(blocked);
      return;
    }
    const target = steps[index];
    if (target) goTo(target);
  }

  function importBody(): ClubImport | null {
    const players = hasRoster && rosterCsv ? parsedImportValues<ClubImportPlayer>(rosterCsv.parsed) : [];
    const transactions = hasFinance && financeCsv ? parsedImportValues<TransactionWrite>(financeCsv.parsed) : [];
    const events = hasEvents && eventsCsv ? parsedImportValues<EventWrite>(eventsCsv.parsed) : [];
    if (players.length + transactions.length + events.length === 0) return null;
    return {
      ...(players.length > 0 ? { players } : {}),
      ...(transactions.length > 0 ? { transactions } : {}),
      ...(events.length > 0 ? { events } : {}),
    };
  }

  async function readCsv(kind: CsvImportKind, file: File) {
    const copy = csvCopy[kind];
    if (!isCsvFile(file)) {
      setErrors((current) => ({ ...current, [copy.errorKey]: CSV_ERROR }));
      notifyDanger(CSV_ERROR);
      return;
    }
    const text = await file.text();
    const parsed = parseClubCsv(kind, text);
    const upload = { file, parsed };
    if (kind === "roster") setRosterCsv(upload);
    if (kind === "finance") setFinanceCsv(upload);
    if (kind === "events") setEventsCsv(upload);
    setErrors((current) => ({ ...current, [copy.errorKey]: undefined }));
  }

  function setChecked(kind: PreviewStepId, checked: boolean) {
    if (kind === "roster") {
      setHasRoster(checked);
      if (!checked) setRosterCsv(null);
    }
    if (kind === "finance") {
      setHasFinance(checked);
      if (!checked) setFinanceCsv(null);
    }
    if (kind === "events") {
      setHasEvents(checked);
      if (!checked) setEventsCsv(null);
    }
    if (!checked) setErrors((current) => ({ ...current, [csvCopy[kind].errorKey]: undefined }));
  }

  async function onCreate() {
    const accountIssues = personalErrors();
    const clubIssues = clubErrors();
    const nextErrors = { ...accountIssues, ...clubIssues };
    if (!showIssues(nextErrors)) {
      setStepId(accountIssues.name || accountIssues.email || accountIssues.password ? "personal" : "club");
      return;
    }
    const blocked = blockingPreview();
    if (blocked) {
      notifyDanger(uploads[blocked]?.parsed.fileError ?? ROW_ERROR);
      goTo(blocked);
      return;
    }
    const account = registerSchema.safeParse({ name, email, password });
    const club = clubWriteSchema.safeParse({ name: clubName, description, goals });
    if (!account.success || !club.success) return;

    setPending(true);
    setErrors({});
    try {
      let draft = createdRef.current;
      if (!draft) {
        try {
          await api.register(account.data);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) throw err;
        }
        const login = await api.login({ email: account.data.email, password: account.data.password });
        const created = await api.createClub(login.token, club.data);
        draft = {
          token: login.token,
          user: created.user,
          clubId: created.club.id,
          mediaUploaded: false,
          imported: false,
        };
        createdRef.current = draft;
      }
      if (!draft.mediaUploaded) {
        if (logo) await api.uploadLogo(draft.token, draft.clubId, logo);
        for (const file of jerseys) {
          await api.uploadJersey(draft.token, draft.clubId, file);
        }
        draft = { ...draft, mediaUploaded: true };
        createdRef.current = draft;
      }
      if (!draft.imported) {
        const payload = importBody();
        if (payload) await api.importClubData(draft.token, draft.clubId, payload);
        draft = { ...draft, imported: true };
        createdRef.current = draft;
      }
      session.signIn(draft.token, draft.user, draft.clubId);
      setStepId("complete");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Could not create the club.";
      setErrors({ clubName: errMsg });
      notifyDanger(errMsg);
    } finally {
      setPending(false);
    }
  }

  const previewId = isPreviewStep(stepId) ? stepId : null;
  const previewUpload = previewId ? uploads[previewId] : null;

  return (
    <main className="auth-wrap">
      <Surface className="register-surface" variant="default">
        <nav aria-label="Registration steps" className="register-crumbs">
          <Breadcrumbs>
            {steps.map((item, index) => {
              const reached = index < stepIndex;
              const future = index > stepIndex;
              return (
                <Breadcrumbs.Item
                  key={item}
                  aria-current={item === stepId ? "page" : "false"}
                  className={item === stepId ? "register-crumb-current" : undefined}
                  href={item === stepId ? undefined : "#"}
                  isDisabled={future || pending}
                  onClick={(event) => {
                    event.preventDefault();
                    if (reached && !pending) openReachedStep(index);
                  }}
                >
                  {stepLabels[item]}
                </Breadcrumbs.Item>
              );
            })}
          </Breadcrumbs>
        </nav>
        {previewId ? (
          <p className="register-import-note">Below is the data read from your file. Check if the data is correct.</p>
        ) : null}

        <div className="register-columns">
          <div className="register-intro">
            <p className="eyebrow">MYCLUB</p>
            <h1>Create your club</h1>
            <p className="muted">Manage your club and players with ease.</p>
          </div>

          {stepId === "personal" ? (
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

          {stepId === "club" ? (
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
              <div className="register-csv-list">
                <CsvChoice
                  checked={hasRoster}
                  copy={csvCopy.roster}
                  error={errors.rosterCsv}
                  fileName={rosterCsv?.file.name}
                  inputRef={rosterInput}
                  testId="register-roster-csv"
                  onChecked={(checked) => setChecked("roster", checked)}
                  onFile={(file) => void readCsv("roster", file)}
                />
                <CsvChoice
                  checked={hasFinance}
                  copy={csvCopy.finance}
                  error={errors.financeCsv}
                  fileName={financeCsv?.file.name}
                  inputRef={financeInput}
                  testId="register-finance-csv"
                  onChecked={(checked) => setChecked("finance", checked)}
                  onFile={(file) => void readCsv("finance", file)}
                />
                <CsvChoice
                  checked={hasEvents}
                  copy={csvCopy.events}
                  error={errors.eventsCsv}
                  fileName={eventsCsv?.file.name}
                  inputRef={eventsInput}
                  testId="register-events-csv"
                  onChecked={(checked) => setChecked("events", checked)}
                  onFile={(file) => void readCsv("events", file)}
                />
              </div>
              <div className="field-pair" data-testid="register-media-row">
                <div className="stack-tight">
                  <div className="field" data-invalid={errors.logo ? "true" : undefined}>
                    <Label>Club logo</Label>
                    <input
                      ref={logoInput}
                      accept="image/jpeg,image/png"
                      aria-invalid={Boolean(errors.logo)}
                      data-testid="register-logo-input"
                      hidden
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
                    <Button type="button" variant="outline" onPress={() => logoInput.current?.click()}>
                      Upload Club Logo
                    </Button>
                    {errors.logo ? (
                      <span className="field-error" data-visible="" role="alert">
                        {errors.logo}
                      </span>
                    ) : null}
                  </div>
                  {logo && logoPreview ? (
                    <img alt="Club logo preview" className="club-logo" src={logoPreview} />
                  ) : null}
                </div>
                <div className="stack-tight">
                  <div className="field" data-invalid={errors.jerseys ? "true" : undefined}>
                    <Label>Jerseys</Label>
                    <input
                      ref={jerseyInput}
                      accept="image/jpeg,image/png"
                      aria-invalid={Boolean(errors.jerseys)}
                      data-testid="register-jersey-input"
                      hidden
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
                    <Button type="button" variant="outline" onPress={() => jerseyInput.current?.click()}>
                      Upload Jersey
                    </Button>
                    {errors.jerseys ? (
                      <span className="field-error" data-visible="" role="alert">
                        {errors.jerseys}
                      </span>
                    ) : null}
                  </div>
                  {jerseyPreviews.length > 0 ? (
                    <div className="jersey-settings-list" data-testid="register-jersey-list">
                      {jerseyPreviews.map((url, index) => (
                        <div key={url} className="jersey-settings-item">
                          <img
                            alt={`Club jersey ${index + 1}`}
                            className="jersey-settings-thumb"
                            src={url}
                          />
                          <Button
                            isIconOnly
                            aria-label={`Remove jersey ${index + 1}`}
                            size="sm"
                            type="button"
                            variant="tertiary"
                            onPress={() => setJerseys((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            <Icon data={Xmark} size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="register-actions">
                <Button type="button" variant="ghost" onPress={() => goTo("personal")}>
                  Back
                </Button>
                <Button type="submit">Next</Button>
              </div>
            </Form>
          ) : null}

          {previewId ? (
            <Form
              className="register-form"
              onSubmit={(event) => {
                event.preventDefault();
                onNextPreview(previewId);
              }}
            >
              <ImportPreview upload={previewUpload} />
              <div className="register-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onPress={() => {
                    const previous = steps[steps.indexOf(previewId) - 1];
                    if (previous) goTo(previous);
                  }}
                >
                  Back
                </Button>
                <Button isDisabled={csvImportBlocked(previewUpload?.parsed ?? null)} type="submit">
                  Next
                </Button>
              </div>
            </Form>
          ) : null}

          {stepId === "confirm" ? (
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
                {previewStepIds.map((kind) =>
                  uploads[kind] ? (
                    <div key={kind}>
                      <dt>{csvCopy[kind].summary}</dt>
                      <dd>{uploads[kind]?.file.name}</dd>
                    </div>
                  ) : null,
                )}
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
                <span className="field-error" data-visible="" role="alert">
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
                        const previous = steps[steps.indexOf("confirm") - 1];
                        if (previous) goTo(previous);
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

          {stepId === "complete" ? (
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

function CsvChoice({
  checked,
  copy,
  error,
  fileName,
  inputRef,
  testId,
  onChecked,
  onFile,
}: {
  checked: boolean;
  copy: (typeof csvCopy)[PreviewStepId];
  error?: string;
  fileName?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  testId: string;
  onChecked: (checked: boolean) => void;
  onFile: (file: File) => void;
}) {
  return (
    <div className="register-csv-block" data-testid={testId}>
      <Checkbox isSelected={checked} name={testId} onChange={onChecked}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          {copy.label}
        </Checkbox.Content>
      </Checkbox>
      {checked ? (
        <div className="field" data-invalid={error ? "true" : undefined}>
          <input
            ref={inputRef}
            accept=".csv,text/csv"
            aria-invalid={Boolean(error)}
            data-testid={`${testId}-input`}
            hidden
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
          <Button type="button" variant="outline" onPress={() => inputRef.current?.click()}>
            {copy.button}
          </Button>
          {fileName ? <p className="register-csv-file">{fileName}</p> : null}
          {error ? (
            <span className="field-error" data-visible="" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ImportPreview({ upload }: { upload: CsvUpload | null }) {
  if (!upload) return <p className="banner">Upload a CSV file on the Club step.</p>;
  const blockedMessage = upload.parsed.fileError
    ? upload.parsed.fileError
    : upload.parsed.rows.some((row) => Object.keys(row.errors).length > 0)
      ? ROW_ERROR
      : null;
  return (
    <div className="register-preview-table">
      {blockedMessage ? (
        <p className="banner" role="alert">
          {blockedMessage}
        </p>
      ) : null}
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={`${stepLabels[upload.parsed.kind]} import`}>
            <Table.Header>
              {upload.parsed.columns.map((column, index) => (
                <Table.Column key={column.key} isRowHeader={index === 0}>
                  {column.label}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body>
              {upload.parsed.rows.length === 0 ? (
                <Table.Row>
                  {upload.parsed.columns.map((column, index) => (
                    <Table.Cell key={column.key}>{index === 0 ? "No rows." : ""}</Table.Cell>
                  ))}
                </Table.Row>
              ) : (
                upload.parsed.rows.map((row, rowIndex) => (
                  <Table.Row key={`${upload.file.name}-${rowIndex}`}>
                    {upload.parsed.columns.map((column) => (
                      <Table.Cell key={column.key}>
                        <span>{row.rawCells[column.key] ?? ""}</span>
                        {row.errors[column.key] ? <span className="field-error" data-visible="">{row.errors[column.key]}</span> : null}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
