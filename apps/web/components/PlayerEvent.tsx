"use client";

import { eventSummary, eventTypeLabel, formatEventCardDate, type ClubEvent } from "@myclub/shared";
import { Button, Card, Chip, Dropdown, Label } from "@heroui/react";

export const playerReplies = [
  { id: "present", label: "Yes" },
  { id: "maybe", label: "Maybe" },
  { id: "absent", label: "No" },
] as const;

export type PlayerReply = (typeof playerReplies)[number]["id"];

export function playerReplyLabel(status: string) {
  return playerReplies.find((reply) => reply.id === status)?.label ?? null;
}

export function PlayerEvent({
  event,
  pending,
  onReply,
}: {
  event: ClubEvent;
  pending: boolean;
  onReply: (status: PlayerReply) => void;
}) {
  const selected = playerReplyLabel(event.myAttendance?.status ?? "unanswered");

  return (
    <Card className="event-card">
      <Card.Header>
        <div className="event-card-title">
          <Card.Title>{event.name || formatEventCardDate(event.date)}</Card.Title>
          <Card.Description>
            {event.startTime}
            {event.location ? ` · ${event.location}` : ""}
          </Card.Description>
        </div>
        <Chip className={eventChipClass(event.type)} color={eventChipColor(event.type)} size="sm" variant="soft">
          {eventTypeLabel(event.type)}
        </Chip>
      </Card.Header>
      <Card.Content>
        {event.opponent ? <p>{eventSummary(event)}</p> : null}
        {event.notes ? <p>{event.notes}</p> : null}
        {event.result ? (
          <p className="muted">
            {event.scoreFor}–{event.scoreAgainst} · {event.result}
          </p>
        ) : null}
        <Dropdown>
          <Button aria-label="Reply" variant="secondary" isDisabled={pending}>
            {pending ? "Saving…" : selected ?? "Reply"}
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu
              aria-label="Reply"
              selectedKeys={selected ? new Set([event.myAttendance?.status ?? ""]) : new Set()}
              selectionMode="single"
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const next = [...keys][0];
                if (next === "present" || next === "maybe" || next === "absent") onReply(next);
              }}
            >
              {playerReplies.map((reply) => (
                <Dropdown.Item key={reply.id} id={reply.id} textValue={reply.label}>
                  <Dropdown.ItemIndicator />
                  <Label>{reply.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </Card.Content>
    </Card>
  );
}

function eventChipColor(type: string) {
  switch (type) {
    case "match":
      return "accent" as const;
    case "friendly":
      return "success" as const;
    case "training":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function eventChipClass(type: string) {
  return type === "leisure" ? "chip-leisure" : undefined;
}
