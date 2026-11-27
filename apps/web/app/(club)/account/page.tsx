"use client";

import { NotificationCentre } from "@/components/NotificationCentre";
import { SettingsImportModal } from "@/components/SettingsImportModal";
import { api } from "@/lib/api";
import { validateWithSchema } from "@/lib/fieldValidation";
import {
  notifyDanger,
  notifyImported,
  notifyImportFailed,
  notifyLogoFailed,
  notifyLogoFormat,
  notifySaved,
  notifyZod,
} from "@/lib/notify";
import { useSession } from "@/lib/session";
import { applyTheme, readDark } from "@/lib/theme";
import {
  clubPatchSchema,
  clubWriteSchema,
  csvImportBlocked,
  parseClubCsv,
  parsedImportValues,
  managesClub,
  passwordChangeFieldErrors,
  profilePatchSchema,
  userInitials,
  type ClubImportPlayer,
  type CsvImportKind,
  type EventWrite,
  type ParsedClubCsv,
  type PasswordChangeFields,
  type TransactionWrite,
} from "@myclub/shared";
import { Camera, ChevronDown, House, Key, LayoutHeaderCells, Person, Xmark } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Accordion,
  Avatar,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  NumberField,
  Surface,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ClubFieldErrors = {
  logo?: string;
  jerseys?: string;
  name?: string;
  description?: string;
  goals?: string;
  attendance?: string;
};

const importTargets: Record<
  CsvImportKind,
  { button: string; toast: "Roster" | "Event" | "Finance"; href: string; testId: string }
> = {
  roster: { button: "Upload roster CSV", toast: "Roster", href: "/roster", testId: "settings-roster-csv" },
  events: { button: "Upload matches CSV", toast: "Event", href: "/calendar", testId: "settings-events-csv" },
  finance: { button: "Upload finance CSV", toast: "Finance", href: "/finance", testId: "settings-finance-csv" },
};

function isImageFile(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function imageError(message: string) {
  return (
    message === "Use a JPG or PNG image." ||
    message === "Choose an image." ||
    message === "Unsupported format" ||
    message === "Unsupported format, please upload a valid image"
  );
}

export default function AccountPage() {
  const session = useSession();
  const router = useRouter();
  const manager = managesClub(session.role);
  const displayName = session.user?.name ?? "";

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Account</h1>
        </div>
        <NotificationCentre />
      </div>
      <ProfileHeader name={displayName} avatarUrl={session.user?.avatarUrl ?? ""} />
      <Surface className="settings-accordion-surface" data-testid="account-accordion-surface" variant="default">
        <Accordion className="settings-accordion">
          <PersonalSection />
          <PasswordSection />
          {manager ? <ClubSection /> : null}
          {manager ? <DataSection onImported={(href) => router.push(href)} /> : null}
        </Accordion>
      </Surface>
    </>
  );
}

function SectionTrigger({ icon, label }: { icon: typeof Person; label: string }) {
  return (
    <Accordion.Trigger>
      <span className="settings-accordion-icon" aria-hidden="true">
        <Icon data={icon} size={18} />
      </span>
      {label}
      <Accordion.Indicator>
        <ChevronDown aria-hidden="true" width={18} height={18} />
      </Accordion.Indicator>
    </Accordion.Trigger>
  );
}

function ProfileHeader({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  const session = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPreview(avatarUrl);
  }, [avatarUrl]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session.token) return;
    if (!isImageFile(file)) {
      setError("Unsupported format, please upload a valid image");
      notifyLogoFormat();
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await api.uploadAvatar(session.token, file, { commit: false });
      if (!result.avatarUrl) throw new Error("Could not upload the photo.");
      const saved = await api.updateProfile(session.token, {
        name: session.user?.name ?? name,
        contact: session.user?.contact ?? "",
        avatarUrl: result.avatarUrl,
      });
      setPreview(saved.user.avatarUrl);
      session.signIn(session.token, saved.user, session.clubId ?? undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (imageError(message)) {
        setError("Unsupported format, please upload a valid image");
        notifyLogoFormat();
      } else {
        setError("Could not upload the photo.");
        notifyLogoFailed();
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="settings-profile">
      <input
        ref={fileInput}
        accept="image/jpeg,image/png"
        data-testid="settings-avatar-input"
        hidden
        type="file"
        onChange={(event) => void onFile(event)}
      />
      <button
        type="button"
        className="settings-avatar-button"
        aria-label="Upload profile photo"
        disabled={uploading}
        onClick={() => fileInput.current?.click()}
      >
        <Avatar size="lg">
          {preview ? <Avatar.Image alt={`${name} photo`} src={preview} /> : null}
          <Avatar.Fallback>{userInitials(name)}</Avatar.Fallback>
        </Avatar>
        <span className="settings-avatar-camera">
          <Icon data={Camera} size={18} />
        </span>
      </button>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
      <h2>{name}</h2>
    </div>
  );
}

function PersonalSection() {
  const session = useSession();
  const [name, setName] = useState(session.user?.name ?? "");
  const [contact, setContact] = useState(session.user?.contact ?? "");
  const [dark, setDark] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; contact?: string }>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setDark(readDark());
  }, []);

  function updateError(field: "name" | "contact", message: string | null) {
    setErrors((current) => {
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
    if (!session.token) return;
    const nameError = validateWithSchema(profilePatchSchema.shape.name, name);
    const contactError = validateWithSchema(profilePatchSchema.shape.contact, contact);
    setErrors({
      ...(nameError ? { name: nameError } : {}),
      ...(contactError ? { contact: contactError } : {}),
    });
    const parsed = profilePatchSchema.safeParse({ name, contact });
    if (!parsed.success) {
      notifyZod(parsed.error, "Check the form and try again.");
      return;
    }
    setPending(true);
    try {
      const result = await api.updateProfile(session.token, parsed.data);
      session.signIn(session.token, result.user, session.clubId ?? undefined);
      setName(result.user.name);
      setContact(result.user.contact);
      notifySaved();
    } catch (err) {
      notifyDanger(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Accordion.Item id="personal">
      <Accordion.Heading>
        <SectionTrigger icon={Person} label="Personal" />
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body>
          <Form className="stack" data-testid="settings-personal" onSubmit={onSubmit}>
            <TextField
              name="name"
              isRequired
              isInvalid={Boolean(errors.name)}
              value={name}
              onChange={(value) => {
                setName(value);
                if (errors.name) updateError("name", validateWithSchema(profilePatchSchema.shape.name, value));
              }}
              onBlur={() => updateError("name", validateWithSchema(profilePatchSchema.shape.name, name))}
            >
              <Label>Name</Label>
              <Input />
              <FieldError>{errors.name}</FieldError>
            </TextField>
            <Switch
              aria-label="Dark mode"
              isSelected={dark}
              onChange={(selected) => {
                setDark(selected);
                applyTheme(selected);
              }}
            >
              <Switch.Content data-testid="theme-toggle">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>Dark mode</Label>
              </Switch.Content>
            </Switch>
            <TextField
              name="contact"
              type="tel"
              isInvalid={Boolean(errors.contact)}
              value={contact}
              onChange={(value) => {
                const next = value.replace(/[^0-9-]/g, "");
                setContact(next);
                if (errors.contact) updateError("contact", validateWithSchema(profilePatchSchema.shape.contact, next));
              }}
              onBlur={() => updateError("contact", validateWithSchema(profilePatchSchema.shape.contact, contact))}
            >
              <Label>Contact</Label>
              <Input inputMode="tel" />
              <FieldError>{errors.contact}</FieldError>
            </TextField>
            <div className="settings-actions">
              <Button type="submit" size="lg" variant="primary" isDisabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </Form>
        </Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function PasswordSection() {
  const session = useSession();
  const [fields, setFields] = useState<PasswordChangeFields>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<PasswordChangeFields>>({});
  const [pending, setPending] = useState(false);

  function setField(field: keyof PasswordChangeFields, value: string) {
    const next = { ...fields, [field]: value };
    setFields(next);
    if (Object.keys(errors).length > 0) setErrors(passwordChangeFieldErrors(next));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token) return;
    const nextErrors = passwordChangeFieldErrors(fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      notifyDanger(Object.values(nextErrors)[0] ?? "Check the form and try again.");
      return;
    }
    if (!fields.currentPassword && !fields.newPassword && !fields.confirmPassword) return;
    setPending(true);
    try {
      await api.changePassword(session.token, {
        currentPassword: fields.currentPassword,
        newPassword: fields.newPassword,
      });
      setFields({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setErrors({});
      notifySaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not change the password.";
      if (message === "Incorrect password") {
        setErrors((current) => ({ ...current, currentPassword: "Incorrect password" }));
      }
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Accordion.Item id="password">
      <Accordion.Heading>
        <SectionTrigger icon={Key} label="Password" />
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body>
          <Form className="stack" data-testid="settings-password" onSubmit={onSubmit}>
            <TextField
              name="currentPassword"
              type="password"
              isInvalid={Boolean(errors.currentPassword)}
              value={fields.currentPassword}
              onChange={(value) => setField("currentPassword", value)}
              onBlur={() => {
                if (Object.keys(errors).length > 0) setErrors(passwordChangeFieldErrors(fields));
              }}
            >
              <Label>Current password</Label>
              <Input autoComplete="current-password" />
              <FieldError>{errors.currentPassword}</FieldError>
            </TextField>
            <TextField
              name="newPassword"
              type="password"
              isInvalid={Boolean(errors.newPassword)}
              value={fields.newPassword}
              onChange={(value) => setField("newPassword", value)}
              onBlur={() => {
                if (Object.keys(errors).length > 0) setErrors(passwordChangeFieldErrors(fields));
              }}
            >
              <Label>New password</Label>
              <Input autoComplete="new-password" />
              <FieldError>{errors.newPassword}</FieldError>
            </TextField>
            <TextField
              name="confirmPassword"
              type="password"
              isInvalid={Boolean(errors.confirmPassword)}
              value={fields.confirmPassword}
              onChange={(value) => setField("confirmPassword", value)}
              onBlur={() => {
                if (Object.keys(errors).length > 0) setErrors(passwordChangeFieldErrors(fields));
              }}
            >
              <Label>Confirm password</Label>
              <Input autoComplete="new-password" />
              <FieldError>{errors.confirmPassword}</FieldError>
            </TextField>
            <div className="settings-actions">
              <Button type="submit" size="lg" variant="primary" isDisabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </Form>
        </Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function ClubSection() {
  const session = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [jerseys, setJerseys] = useState<string[]>([]);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertPercent, setAlertPercent] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ClubFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingJersey, setUploadingJersey] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const jerseyInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || !managesClub(session.role)) return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .club(token, clubId)
      .then(({ club }) => {
        if (cancelled) return;
        setName(club.name);
        setDescription(club.description);
        setGoals(club.goals);
        setLogoUrl(club.logoUrl);
        setJerseys(club.jerseys ?? []);
        setAlertEnabled(club.attendanceAlertEnabled);
        setAlertPercent(club.attendanceAlertPercent);
      })
      .catch((err: unknown) => {
        if (!cancelled) notifyDanger(err instanceof Error ? err.message : "Could not load the club.");
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  function validateField(field: "name" | "description" | "goals", value: string): string | null {
    if (field === "name") return validateWithSchema(clubWriteSchema.shape.name, value);
    if (field === "description") return validateWithSchema(clubWriteSchema.shape.description, value);
    return validateWithSchema(clubWriteSchema.shape.goals, value);
  }

  function updateFieldError(field: keyof ClubFieldErrors, message: string | null) {
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

  async function onLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session.token || !session.clubId) return;
    if (!isImageFile(file)) {
      updateFieldError("logo", "Unsupported format, please upload a valid image");
      notifyLogoFormat();
      return;
    }
    setUploading(true);
    updateFieldError("logo", null);
    try {
      const result = await api.uploadLogo(session.token, session.clubId, file, { commit: false });
      if (!result.logoUrl) throw new Error("Could not upload the logo.");
      setPendingLogo(result.logoUrl);
      setLogoUrl(result.logoUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (imageError(message)) {
        updateFieldError("logo", "Unsupported format, please upload a valid image");
        notifyLogoFormat();
      } else {
        updateFieldError("logo", "Could not upload the logo.");
        notifyLogoFailed();
      }
    } finally {
      setUploading(false);
    }
  }

  async function onJerseyFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || !session.token || !session.clubId) return;
    for (const file of files) {
      if (!isImageFile(file)) {
        updateFieldError("jerseys", "Unsupported format, please upload a valid image");
        notifyLogoFormat();
        return;
      }
    }
    setUploadingJersey(true);
    updateFieldError("jerseys", null);
    try {
      let nextJerseys = jerseys;
      for (const file of files) {
        const result = await api.uploadJersey(session.token, session.clubId, file);
        if (result.club) nextJerseys = result.club.jerseys;
        else if (result.jerseyUrl) nextJerseys = [...nextJerseys, result.jerseyUrl];
      }
      setJerseys(nextJerseys);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (imageError(message)) {
        updateFieldError("jerseys", "Unsupported format, please upload a valid image");
        notifyLogoFormat();
      } else {
        updateFieldError("jerseys", message || "Could not upload the jersey.");
        notifyLogoFailed();
      }
    } finally {
      setUploadingJersey(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || uploading || uploadingJersey) return;
    const nameError = validateField("name", name);
    const descriptionError = validateField("description", description);
    const goalsError = validateField("goals", goals);
    const attendanceError =
      alertEnabled && (alertPercent == null || Number.isNaN(alertPercent)) ? "Attendance percentage is required." : null;
    setFieldErrors((current) => ({
      ...(current.logo ? { logo: current.logo } : {}),
      ...(current.jerseys ? { jerseys: current.jerseys } : {}),
      ...(nameError ? { name: nameError } : {}),
      ...(descriptionError ? { description: descriptionError } : {}),
      ...(goalsError ? { goals: goalsError } : {}),
      ...(attendanceError ? { attendance: attendanceError } : {}),
    }));
    const parsed = clubPatchSchema.safeParse({
      name,
      description,
      goals,
      jerseys,
      attendanceAlertEnabled: alertEnabled,
      attendanceAlertPercent: alertEnabled ? alertPercent : alertPercent,
      ...(pendingLogo ? { logoUrl: pendingLogo } : {}),
    });
    if (!parsed.success) {
      notifyZod(parsed.error, parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setPending(true);
    try {
      await api.updateClub(session.token, session.clubId, parsed.data);
      setPendingLogo(null);
      await session.refresh();
      notifySaved();
    } catch (err) {
      notifyDanger(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Accordion.Item id="club">
      <Accordion.Heading>
        <SectionTrigger icon={House} label="Club" />
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body>
          <Form className="stack" data-testid="settings-club" onSubmit={onSubmit}>
            <div className="field-pair" data-testid="settings-media-row">
              <div className="stack-tight">
                <div className="field" data-invalid={fieldErrors.logo ? "true" : undefined}>
                  <Label>Club logo</Label>
                  <input
                    ref={fileInput}
                    accept="image/jpeg,image/png"
                    data-testid="club-logo-input"
                    hidden
                    type="file"
                    onChange={(event) => void onLogo(event)}
                  />
                  <Button isDisabled={uploading || pending} variant="outline" onPress={() => fileInput.current?.click()}>
                    {uploading ? "Uploading…" : "Upload Club Logo"}
                  </Button>
                  {fieldErrors.logo ? (
                    <span className="field-error" role="alert">
                      {fieldErrors.logo}
                    </span>
                  ) : null}
                </div>
                {logoUrl ? <img className="club-logo" src={logoUrl} alt={`${name || "Club"} logo`} /> : null}
              </div>
              <div className="stack-tight">
                <div className="field" data-invalid={fieldErrors.jerseys ? "true" : undefined}>
                  <Label>Jerseys</Label>
                  <input
                    ref={jerseyInput}
                    accept="image/jpeg,image/png"
                    data-testid="jersey-input"
                    hidden
                    multiple
                    type="file"
                    onChange={(event) => void onJerseyFiles(event)}
                  />
                  <Button
                    isDisabled={uploadingJersey || pending}
                    variant="outline"
                    onPress={() => jerseyInput.current?.click()}
                  >
                    {uploadingJersey ? "Uploading…" : "Upload Jersey"}
                  </Button>
                  {fieldErrors.jerseys ? (
                    <span className="field-error" role="alert">
                      {fieldErrors.jerseys}
                    </span>
                  ) : null}
                </div>
                {jerseys.length > 0 ? (
                  <div className="jersey-settings-list" data-testid="settings-jersey-list">
                    {jerseys.map((url, index) => (
                      <div key={`${index}-${url.slice(-20)}`} className="jersey-settings-item">
                        <img className="jersey-settings-thumb" src={url} alt={`Club jersey ${index + 1}`} />
                        <Button
                          isIconOnly
                          aria-label={`Remove jersey ${index + 1}`}
                          size="sm"
                          type="button"
                          variant="tertiary"
                          onPress={() => setJerseys((current) => current.filter((_, idx) => idx !== index))}
                        >
                          <Icon data={Xmark} size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <TextField
              name="name"
              isInvalid={Boolean(fieldErrors.name)}
              value={name}
              onChange={(value) => {
                setName(value);
                if (fieldErrors.name) updateFieldError("name", validateField("name", value));
              }}
              onBlur={() => updateFieldError("name", validateField("name", name))}
            >
              <Label>Club name</Label>
              <Input />
              <FieldError>{fieldErrors.name}</FieldError>
            </TextField>
            <TextField
              name="description"
              isInvalid={Boolean(fieldErrors.description)}
              value={description}
              onChange={(value) => {
                setDescription(value);
                if (fieldErrors.description) updateFieldError("description", validateField("description", value));
              }}
              onBlur={() => updateFieldError("description", validateField("description", description))}
            >
              <Label>Description</Label>
              <TextArea />
              <FieldError>{fieldErrors.description}</FieldError>
            </TextField>
            <TextField
              name="goals"
              isInvalid={Boolean(fieldErrors.goals)}
              value={goals}
              onChange={(value) => {
                setGoals(value);
                if (fieldErrors.goals) updateFieldError("goals", validateField("goals", value));
              }}
              onBlur={() => updateFieldError("goals", validateField("goals", goals))}
            >
              <Label>Goals</Label>
              <TextArea />
              <FieldError>{fieldErrors.goals}</FieldError>
            </TextField>
            <Switch
              aria-label="Attendance alert"
              isSelected={alertEnabled}
              onChange={(selected) => {
                setAlertEnabled(selected);
                if (!selected) updateFieldError("attendance", null);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>Attendance alert</Label>
              </Switch.Content>
            </Switch>
            {alertEnabled ? (
              <NumberField
                className="settings-percent-field"
                name="attendancePercent"
                isRequired
                minValue={1}
                maxValue={100}
                step={1}
                isInvalid={Boolean(fieldErrors.attendance)}
                value={alertPercent ?? Number.NaN}
                onChange={(value) => {
                  const next = Number.isNaN(value) ? null : value;
                  setAlertPercent(next);
                  if (fieldErrors.attendance) {
                    updateFieldError("attendance", next == null ? "Attendance percentage is required." : null);
                  }
                }}
              >
                <Label>Attendance percentage</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <span className="settings-percent" aria-hidden="true">
                    %
                  </span>
                  <NumberField.IncrementButton />
                </NumberField.Group>
                <FieldError>{fieldErrors.attendance}</FieldError>
              </NumberField>
            ) : null}
            <div className="settings-actions">
              <Button type="submit" size="lg" variant="primary" isDisabled={pending || uploading || uploadingJersey}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </Form>
        </Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function DataSection({ onImported }: { onImported: (href: string) => void }) {
  const session = useSession();
  const inputs = useRef<Partial<Record<CsvImportKind, HTMLInputElement | null>>>({});
  const [errors, setErrors] = useState<Partial<Record<CsvImportKind, string>>>({});
  const [preview, setPreview] = useState<{ kind: CsvImportKind; parsed: ParsedClubCsv } | null>(null);
  const [pending, setPending] = useState(false);

  async function onFile(kind: CsvImportKind, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isCsvFile(file)) {
      setErrors((current) => ({ ...current, [kind]: "Upload a CSV file." }));
      return;
    }
    setErrors((current) => ({ ...current, [kind]: undefined }));
    const parsed = parseClubCsv(kind, await file.text());
    setPreview({ kind, parsed });
  }

  async function onConfirm() {
    if (!preview || !session.token || !session.clubId || csvImportBlocked(preview.parsed) || pending) return;
    const target = importTargets[preview.kind];
    const body =
      preview.kind === "roster"
        ? { players: parsedImportValues<ClubImportPlayer>(preview.parsed) }
        : preview.kind === "finance"
          ? { transactions: parsedImportValues<TransactionWrite>(preview.parsed) }
          : { events: parsedImportValues<EventWrite>(preview.parsed) };
    setPending(true);
    try {
      await api.importClubData(session.token, session.clubId, body);
      const href = target.href;
      setPreview(null);
      notifyImported(target.toast, () => onImported(href));
    } catch {
      notifyImportFailed(target.toast);
    } finally {
      setPending(false);
    }
  }

  return (
    <Accordion.Item id="data">
      <Accordion.Heading>
        <SectionTrigger icon={LayoutHeaderCells} label="Data" />
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body>
          <div className="stack" data-testid="settings-data">
            {(Object.keys(importTargets) as CsvImportKind[]).map((kind) => {
              const target = importTargets[kind];
              return (
                <div key={kind} className="field" data-invalid={errors[kind] ? "true" : undefined}>
                  <input
                    ref={(node) => {
                      inputs.current[kind] = node;
                    }}
                    accept=".csv,text/csv"
                    data-testid={target.testId}
                    hidden
                    type="file"
                    onChange={(event) => void onFile(kind, event)}
                  />
                  <Button type="button" variant="outline" onPress={() => inputs.current[kind]?.click()}>
                    {target.button}
                  </Button>
                  {errors[kind] ? (
                    <span className="field-error" role="alert">
                      {errors[kind]}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <SettingsImportModal
            parsed={preview?.parsed ?? null}
            pending={pending}
            title={`${importTargets[preview?.kind ?? "roster"].toast} import`}
            onCancel={() => {
              if (!pending) setPreview(null);
            }}
            onConfirm={() => void onConfirm()}
          />
        </Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
