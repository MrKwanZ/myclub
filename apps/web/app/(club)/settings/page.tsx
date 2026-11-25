"use client";

import { api } from "@/lib/api";
import { validateWithSchema } from "@/lib/fieldValidation";
import { notifyDanger, notifyLogoFailed, notifyLogoFormat, notifySaved, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { applyTheme, readDark } from "@/lib/theme";
import { clubPatchSchema, clubWriteSchema } from "@myclub/shared";
import { Button, Card, FieldError, Form, Input, Label, Switch, TextArea, TextField } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

type SettingsFieldErrors = {
  logo?: string;
  name?: string;
  description?: string;
  goals?: string;
};

export default function SettingsPage() {
  const session = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || session.role !== "manager") return;
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

  function updateFieldError(field: keyof SettingsFieldErrors, message: string | null) {
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
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
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
      if (
        message === "Use a JPG or PNG image." ||
        message === "Choose an image." ||
        message === "Unsupported format" ||
        message === "Unsupported format, please upload a valid image"
      ) {
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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || uploading) return;
    const nameError = validateField("name", name);
    const descriptionError = validateField("description", description);
    const goalsError = validateField("goals", goals);
    setFieldErrors((current) => ({
      ...(current.logo ? { logo: current.logo } : {}),
      ...(nameError ? { name: nameError } : {}),
      ...(descriptionError ? { description: descriptionError } : {}),
      ...(goalsError ? { goals: goalsError } : {}),
    }));
    const parsed = clubPatchSchema.safeParse({
      name,
      description,
      goals,
      ...(pendingLogo ? { logoUrl: pendingLogo } : {}),
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the form and try again.";
      notifyZod(parsed.error, message);
      return;
    }
    setPending(true);
    try {
      await api.updateClub(session.token, session.clubId, parsed.data);
      setPendingLogo(null);
      await session.refresh();
      notifySaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>Settings</h1>
      </div>
      <ThemeCard />
      <Form className="card stack" onSubmit={onSubmit}>
        <div className="field" data-invalid={fieldErrors.logo ? "true" : undefined}>
          <Label>Club logo</Label>
          <input
            ref={fileInput}
            accept="image/jpeg,image/png"
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
        {logoUrl ? <img className="club-logo" src={logoUrl} alt="" /> : null}
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
          <Label>Name</Label>
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
        <div>
          <Button type="submit" variant="primary" isDisabled={pending || uploading}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Form>
    </>
  );
}

function ThemeCard() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(readDark());
  }, []);

  return (
    <Card>
      <Card.Header>
        <Card.Title>Appearance</Card.Title>
        <Card.Description>Switch between light and dark mode.</Card.Description>
      </Card.Header>
      <Card.Content>
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
      </Card.Content>
    </Card>
  );
}
