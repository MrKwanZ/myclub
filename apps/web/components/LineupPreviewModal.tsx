"use client";

import { LineupPitch } from "@/components/LineupPitch";
import { eventTypeLabel, formatEventWhen, type ClubEvent } from "@myclub/shared";
import { ChartColumnStacked } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Button, Modal, Tooltip } from "@heroui/react";
import { useState } from "react";

export function ShowLineupButton({ event }: { event: ClubEvent }) {
  const [open, setOpen] = useState(false);

  if ((event.type !== "match" && event.type !== "friendly") || !event.lineup || event.lineup.players.length === 0) {
    return null;
  }

  return (
    <>
      <Tooltip delay={0}>
        <Button
          isIconOnly
          aria-label="Show lineup"
          data-testid={`show-lineup-${event.id}`}
          variant="secondary"
          onPress={() => setOpen(true)}
        >
          <Icon data={ChartColumnStacked} size={16} />
        </Button>
        <Tooltip.Content placement="top">Show lineup</Tooltip.Content>
      </Tooltip>
      <LineupPreviewModal event={event} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LineupPreviewModal({
  event,
  open,
  onClose,
}: {
  event: ClubEvent;
  open: boolean;
  onClose: () => void;
}) {
  if (!event.lineup) return null;
  const heading = event.name || event.opponent || `${eventTypeLabel(event.type)} Lineup`;

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="lineup-preview-dialog">
          <Modal.CloseTrigger />
          <Modal.Header>
            <div className="stack-tight">
              <Modal.Heading>{heading}</Modal.Heading>
              <p className="muted">
                {formatEventWhen(event.date, event.startTime)}
                {event.opponent ? ` · ${event.opponent}` : ""}
              </p>
            </div>
          </Modal.Header>
          <Modal.Body>
            <div className="lineup-modal-pitch-wrap">
              <LineupPitch jerseyUrl={event.lineup.jerseyUrl} players={event.lineup.players} />
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
