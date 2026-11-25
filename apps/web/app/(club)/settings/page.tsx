"use client";

import { api } from "@/lib/api";
import { notifyDanger, notifyLogoFailed, notifyLogoFormat, notifySaved, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { clubPatchSchema } from "@myclub/shared";
import { Button, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

export default function SettingsPage() {
  const session = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the club.");
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  async function onLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session.token || !session.clubId) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      notifyLogoFormat();
      return;
    }
    setUploading(true);
    setError(null);
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
        notifyLogoFormat();
      } else {
        notifyLogoFailed();
      }
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || uploading) return;
    setSaved(false);
    const parsed = clubPatchSchema.safeParse({
      name,
      description,
      goals,
      ...(pendingLogo ? { logoUrl: pendingLogo } : {}),
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the form and try again.";
      setError(message);
      notifyZod(parsed.error, message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.updateClub(session.token, session.clubId, parsed.data);
      setPendingLogo(null);
      await session.refresh();
      setSaved(true);
      notifySaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
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
      <Form className="card stack" onSubmit={onSubmit}>
        <div className="field">
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
        </div>
        {logoUrl ? <img className="club-logo" src={logoUrl} alt="" /> : null}
        <TextField name="name" value={name} onChange={setName}>
          <Label>Name</Label>
          <Input />
        </TextField>
        <TextField name="description" value={description} onChange={setDescription}>
          <Label>Description</Label>
          <TextArea />
        </TextField>
        <TextField name="goals" value={goals} onChange={setGoals}>
          <Label>Goals</Label>
          <TextArea />
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
