"use client";

import { api } from "@/lib/api";
import { eventTypeLabel, formatLongDate, type AuthUser, type ClubEvent } from "@myclub/shared";
import { toast } from "@heroui/react";

export function notifySaved() {
  toast.success("Saved successfully");
}

export function notifySignedOut() {
  toast.success("Signed out successfully");
}

export function notifySignOutFailed() {
  toast.danger("Oops, something went wrong. Please try again.");
}

export function notifyLogoFormat() {
  toast.danger("Unsupported format, please upload a valid image");
}

export function notifyLogoFailed() {
  toast.danger("Something went wrong during the image upload. Please try again");
}

export function notifyReplied(option: "Yes" | "Maybe" | "No") {
  toast(`You replied ${option}`, { variant: "default" });
}

export function notifyMaybeReminder(eventName: string) {
  const name = eventName.trim() || "the event";
  toast("Confirm your attendance", {
    description: `You replied Maybe for ${name}. Please confirm the day before the event.`,
    variant: "default",
  });
}

export function notifyPlayerAdded() {
  toast.success("Player added");
}

export function notifyEventCreated() {
  toast.success("Event created");
}

export function notifyTransactionAdded() {
  toast.success("Transaction added");
}

export function notifyDeleted() {
  toast.success("Deleted successfully");
}

export function notifyRequired(field: string) {
  toast.danger(`${field} is required`);
}

export function notifyDanger(message: string) {
  if (
    message === "User does not exist" ||
    message === "Incorrect password" ||
    message === "Unsupported format"
  ) {
    toast.danger(message);
    return;
  }
  if (message === "Use a JPG or PNG image." || message === "Choose an image.") {
    toast.danger("Unsupported format");
    return;
  }
  const required = message.match(/^(.*) is required\.?$/i);
  if (required) {
    toast.danger(`${required[1]} is required`);
    return;
  }
  toast.danger(message.replace(/\.$/, ""));
}

export function notifyZod(error: { issues: { message: string }[] }, fallback: string) {
  const issues = error.issues.length ? error.issues : [{ message: fallback }];
  const required = issues.filter((issue) => /is required/i.test(issue.message));
  const chosen = required.length ? required : issues.slice(0, 1);
  for (const issue of chosen) notifyDanger(issue.message);
}

export async function notifyWelcome(token: string, user: AuthUser, clubId: string | null) {
  const role = user.memberships.find((membership) => membership.clubId === clubId)?.role ?? null;
  let description: string | undefined;
  if (clubId) {
    try {
      const result = await api.events(token, clubId, { upcoming: "1" });
      const next = result.events[0];
      if (next) description = incomingCopy(next, role, result.playerLinked !== false);
    } catch {
      description = undefined;
    }
  }
  toast(`Welcome ${user.name}`, description ? { description, variant: "default" } : { variant: "default" });
}

function incomingCopy(event: ClubEvent, role: string | null, playerLinked: boolean) {
  const when = `${formatLongDate(event.date)}, ${event.startTime}`;
  let message = `Incoming a ${eventTypeLabel(event.type)} on ${when} at ${event.location}.`;
  const unanswered = !event.myAttendance || event.myAttendance.status === "unanswered";
  if (role === "player" && playerLinked && unanswered) message += " Please reply your availability";
  return message;
}
