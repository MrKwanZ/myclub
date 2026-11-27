"use client";

import { api } from "@/lib/api";
import { validateWithSchema } from "@/lib/fieldValidation";
import { notifyAnnouncementCreated, notifyDanger, notifyRequired, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { announcementWriteSchema, managesClub } from "@myclub/shared";
import { Button, FieldError, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

type FieldErrors = { title?: string; content?: string };

export function AnnouncementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setTitle("");
    setContent("");
    setFieldErrors({});
    setError(null);
  }

  function close() {
    if (pending) return;
    reset();
    onClose();
  }

  function updateFieldError(field: keyof FieldErrors, message: string | null) {
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
    if (!session.token || !session.clubId || !managesClub(session.role)) return;
    const titleError = validateWithSchema(announcementWriteSchema.shape.title, title);
    const contentError = validateWithSchema(announcementWriteSchema.shape.content, content);
    setFieldErrors({
      ...(titleError ? { title: titleError } : {}),
      ...(contentError ? { content: contentError } : {}),
    });
    if (!title.trim()) {
      notifyRequired("Title");
      return;
    }
    if (!content.trim()) {
      notifyRequired("Content");
      return;
    }
    const parsed = announcementWriteSchema.safeParse({ title, content });
    if (!parsed.success) {
      notifyZod(parsed.error, "Check the announcement and try again.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createAnnouncement(session.token, session.clubId, parsed.data);
      reset();
      onClose();
      notifyAnnouncementCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the announcement.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => { if (!next) close(); }}>
      <Modal.Container>
        <Modal.Dialog className="modal-form">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>New Announcement</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <Form className="stack" onSubmit={onSubmit}>
              <TextField
                name="title"
                isInvalid={Boolean(fieldErrors.title)}
                value={title}
                onChange={(value) => {
                  setTitle(value);
                  if (fieldErrors.title) updateFieldError("title", validateWithSchema(announcementWriteSchema.shape.title, value));
                }}
                onBlur={() => updateFieldError("title", validateWithSchema(announcementWriteSchema.shape.title, title))}
              >
                <Label>Title</Label>
                <Input />
                <FieldError>{fieldErrors.title}</FieldError>
              </TextField>
              <TextField
                name="content"
                isInvalid={Boolean(fieldErrors.content)}
                value={content}
                onChange={(value) => {
                  setContent(value);
                  if (fieldErrors.content) {
                    updateFieldError("content", validateWithSchema(announcementWriteSchema.shape.content, value));
                  }
                }}
                onBlur={() => updateFieldError("content", validateWithSchema(announcementWriteSchema.shape.content, content))}
              >
                <Label>Content</Label>
                <TextArea />
                <FieldError>{fieldErrors.content}</FieldError>
              </TextField>
              {error ? <p className="muted">{error}</p> : null}
              <Button type="submit" variant="primary" isDisabled={pending}>
                {pending ? "Adding…" : "Add Announcement"}
              </Button>
            </Form>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
