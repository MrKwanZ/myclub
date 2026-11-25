"use client";

import { api } from "@/lib/api";
import { notificationsSettled } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { notificationHref, notificationWindowDays, type NotificationItem } from "@myclub/shared";
import { Bell, BellFill } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Button, Popover, Spinner, toast } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationCentre() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!session.token) return;
    setLoading(true);
    setError(null);
    try {
      await notificationsSettled();
      const result = await api.notifications(session.token, session.clubId);
      setItems(result.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    toast.clear();
    void load();
  }

  function onSelect(item: NotificationItem) {
    const href = notificationHref(item, session.role);
    if (!href) return;
    setOpen(false);
    router.push(href);
  }

  return (
    <Popover isOpen={open} onOpenChange={onOpenChange}>
      <Button isIconOnly aria-label="Notifications" data-testid="notification-centre" variant="tertiary">
        <Icon data={open ? BellFill : Bell} size={18} />
      </Button>
      <Popover.Content className="notification-popover" placement="bottom end">
        <Popover.Dialog aria-label="Notifications">
          <Popover.Heading>Notifications</Popover.Heading>
          {loading ? (
            <div className="notification-loading">
              <Spinner size="sm" />
            </div>
          ) : error ? (
            <p className="muted">{error}</p>
          ) : items.length === 0 ? (
            <p className="muted">No notifications in the past {notificationWindowDays} days.</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    className="notification-item"
                    data-kind={item.kind}
                    data-variant={item.variant}
                    type="button"
                    onClick={() => onSelect(item)}
                  >
                    <span className="notification-dot" aria-hidden="true" />
                    <span className="notification-text">
                      <strong>{item.title}</strong>
                      {item.description ? <span>{item.description}</span> : null}
                      <time className="muted" dateTime={item.createdAt}>
                        {formatStamp(item.createdAt)}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
