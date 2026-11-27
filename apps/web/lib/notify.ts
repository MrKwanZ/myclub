"use client";

import { api } from "@/lib/api";
import { CLUB_KEY, TOKEN_KEY } from "@/lib/storage";
import {
  incomingEventMessage,
  incomingEventTitle,
  shouldRemindEventReply,
  type AuthUser,
  type NotificationKind,
  type NotificationVariant,
} from "@myclub/shared";
import { toast } from "@heroui/react";
import { createElement } from "react";

type ShowOptions = {
  variant?: NotificationVariant;
  description?: string;
  kind?: NotificationKind;
  eventDate?: string | null;
  token?: string;
  clubId?: string | null;
  onPress?: () => void;
  timeout?: number;
};

const pending = new Set<Promise<unknown>>();

function show(title: string, options: ShowOptions = {}) {
  const variant = options.variant ?? "default";
  const message = options.onPress
    ? createElement("button", { type: "button", className: "toast-link", onClick: options.onPress }, title)
    : title;
  const toastOptions = {
    ...(options.description ? { description: options.description } : {}),
    ...(options.timeout != null ? { timeout: options.timeout } : {}),
  };
  if (variant === "success") toast.success(message, toastOptions);
  else if (variant === "danger") toast.danger(message, toastOptions);
  else if (variant === "warning") toast.warning(message, toastOptions);
  else toast(message, { ...toastOptions, variant: "default" });
  record(title, variant, options);
}

/** Signed-out toasts are not kept: the notification centre belongs to an account. */
function record(title: string, variant: NotificationVariant, options: ShowOptions) {
  const token = options.token ?? localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const clubId = options.clubId !== undefined ? options.clubId : localStorage.getItem(CLUB_KEY);
  const job: Promise<unknown> = api
    .recordNotification(token, {
      title,
      description: options.description ?? "",
      variant,
      kind: options.kind ?? "other",
      clubId,
      eventDate: options.eventDate ?? null,
    })
    .catch(() => undefined)
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Resolves once every toast shown so far has been saved for the notification centre. */
export function notificationsSettled() {
  return Promise.allSettled([...pending]);
}

export function notifySaved() {
  show("Saved successfully", { variant: "success" });
}

export function notifySignedOut() {
  show("Signed out successfully", { variant: "success" });
}

export function notifySignOutFailed() {
  show("Oops, something went wrong. Please try again.", { variant: "danger" });
}

export function notifyLogoFormat() {
  show("Unsupported format, please upload a valid image", { variant: "danger" });
}

export function notifyLogoFailed() {
  show("Something went wrong during the image upload. Please try again", { variant: "danger" });
}

export function notifyReplied(option: "Yes" | "Maybe" | "No") {
  show(`You replied ${option}`, { kind: "attendance" });
}

export function notifyMaybeReminder(event: { name: string; date: string } | undefined) {
  const name = event?.name.trim() || "the event";
  show("Confirm your attendance", {
    description: `You replied Maybe for ${name}. Please confirm the day before the event.`,
    kind: "event",
    eventDate: event?.date ?? null,
  });
}

export function notifyPlayerAdded() {
  show("Player added", { variant: "success" });
}

export function notifyEventCreated() {
  show("Event created", { variant: "success" });
}

export function notifyAnnouncementCreated() {
  show("Announcement created successfully", { variant: "success" });
}

export function notifyTransactionAdded() {
  show("Transaction added", { variant: "success" });
}

export function notifyImported(kind: "Roster" | "Event" | "Finance", onView: () => void) {
  show(`${kind} data uploaded successfully. Click to view.`, {
    variant: "success",
    onPress: onView,
    timeout: 8000,
  });
}

export function notifyImportFailed(kind: "Roster" | "Event" | "Finance") {
  show(`Failed to upload ${kind} data, please try again later`, { variant: "danger" });
}

export function notifyDeleted() {
  show("Deleted successfully", { variant: "success" });
}

export function notifyRequired(field: string) {
  show(`${field} is required`, { variant: "danger" });
}

export function notifyDanger(message: string) {
  if (
    message === "User does not exist" ||
    message === "Incorrect password" ||
    message === "Unsupported format"
  ) {
    show(message, { variant: "danger" });
    return;
  }
  if (message === "Use a JPG or PNG image." || message === "Choose an image.") {
    show("Unsupported format", { variant: "danger" });
    return;
  }
  const required = message.match(/^(.*) is required\.?$/i);
  if (required) {
    show(`${required[1]} is required`, { variant: "danger" });
    return;
  }
  show(message.replace(/\.$/, ""), { variant: "danger" });
}

export function notifyZod(error: { issues: { message: string }[] }, fallback: string) {
  const issues = error.issues.length ? error.issues : [{ message: fallback }];
  const required = issues.filter((issue) => /is required/i.test(issue.message));
  const chosen = required.length ? required : issues.slice(0, 1);
  for (const issue of chosen) notifyDanger(issue.message);
}

export async function notifyStatusNotices(token: string) {
  try {
    const { notices } = await api.statusNotices(token);
    if (notices.length === 0) return;
    for (const notice of notices) {
      show(notice.message, { description: notice.remarks || undefined, token, clubId: notice.clubId });
    }
    await api.readStatusNotices(
      token,
      notices.map((notice) => notice.id),
    );
  } catch {
    return;
  }
}

/** Shows unread announcements the same way as any other toast, so the notification centre keeps them. */
export async function notifyAnnouncements(token: string) {
  try {
    const { announcements } = await api.announcements(token);
    if (announcements.length === 0) return;
    for (const announcement of announcements) {
      show(announcement.title, {
        description: announcement.content || undefined,
        token,
        clubId: announcement.clubId,
      });
    }
    await api.readAnnouncements(
      token,
      announcements.map((announcement) => announcement.id),
    );
  } catch {
    return;
  }
}

/** Warns a player on sign-in when their attendance is under the club's saved percentage. */
export async function notifyAttendanceAlerts(token: string) {
  try {
    const { alerts } = await api.attendanceAlerts(token);
    for (const alert of alerts) {
      show(alert.message, { variant: "warning", token, clubId: alert.clubId });
    }
  } catch {
    return;
  }
}

/** Tells the member about the next event. No welcome toast is shown at sign-in. */
export async function notifyIncomingEvent(token: string, user: AuthUser, clubId: string | null) {
  if (!clubId) return;
  const role = user.memberships.find((membership) => membership.clubId === clubId)?.role ?? null;
  try {
    const result = await api.events(token, clubId, { upcoming: "1" });
    const next = result.events[0];
    if (!next) return;
    const remindReply = shouldRemindEventReply(role, result.playerLinked !== false, next.myAttendance?.status);
    show(incomingEventTitle, {
      description: incomingEventMessage(next, remindReply),
      token,
      clubId,
      kind: "event",
      eventDate: next.date,
    });
  } catch {
    return;
  }
}
