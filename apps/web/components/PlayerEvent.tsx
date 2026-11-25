"use client";

import { ShowLineupButton } from "@/components/LineupPreviewModal";
import { eventHasStarted, eventSummary, eventTypeLabel, formatEventCardDate, type ClubEvent } from "@myclub/shared";
import { Button, Card, Chip, Dropdown, Label } from "@heroui/react";

export const playerReplies = [
  { id: "unanswered", label: "RSVP" },
  { id: "present", label: "Yes" },
  { id: "maybe", label: "Maybe" },
  { id: "absent", label: "No" },
] as const;

export type PlayerReply = Exclude<(typeof playerReplies)[number]["id"], "unanswered">;

export function playerReplyLabel(status: string) {
  return playerReplies.find((reply) => reply.id === status)?.label ?? null;
}

export function PlayerEvent({
  event,
  pending,
  showLineup = false,
  onReply,
}: {
  event: ClubEvent;
  pending: boolean;
  showLineup?: boolean;
  onReply: (status: PlayerReply) => void;
}) {
  const status = event.myAttendance?.status ?? "unanswered";
  const unanswered = status === "unanswered";
  const pendingReply = unanswered && !eventHasStarted(event.date, event.startTime);
  const selected = playerReplyLabel(status) ?? "RSVP";

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
        <div className="event-card-row">
          <div className="row">
            {pendingReply ? (
              <Chip color="warning" size="sm" variant="soft">
                Pending Reply
              </Chip>
            ) : null}
            {unanswered && !pendingReply ? <span>Absent</span> : null}
            <Dropdown>
              <Button aria-label={selected} variant="secondary" isDisabled={pending}>
                {pending ? "Saving…" : selected}
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label="Reply"
                  selectedKeys={new Set([unanswered ? "unanswered" : status])}
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
          </div>
          {showLineup ? <ShowLineupButton event={event} /> : null}
        </div>
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
