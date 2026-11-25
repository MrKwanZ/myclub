import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationHref, notificationWindowDays, notificationWriteSchema } from "./index.ts";

describe("notification centre", () => {
  it("sends attendance replies to the dashboard attendance tab", () => {
    assert.equal(notificationHref({ kind: "attendance", eventDate: null }, "player"), "/play?tab=attendance");
    assert.equal(notificationHref({ kind: "attendance", eventDate: null }, "manager"), "/dashboard");
  });

  it("sends event reminders to the calendar on the event day", () => {
    assert.equal(notificationHref({ kind: "event", eventDate: "2026-11-28" }, "player"), "/play/calendar?date=2026-11-28");
    assert.equal(notificationHref({ kind: "event", eventDate: "2026-11-28" }, "manager"), "/calendar?date=2026-11-28");
  });

  it("does not redirect other notifications, or events without a date", () => {
    assert.equal(notificationHref({ kind: "other", eventDate: null }, "manager"), null);
    assert.equal(notificationHref({ kind: "other", eventDate: "2026-11-28" }, "player"), null);
    assert.equal(notificationHref({ kind: "event", eventDate: null }, "player"), null);
  });

  it("keeps three days of toasts", () => {
    assert.equal(notificationWindowDays, 3);
  });

  it("validates a recorded toast", () => {
    const parsed = notificationWriteSchema.parse({ title: "Saved successfully", variant: "success" });
    assert.deepEqual(parsed, { title: "Saved successfully", description: "", variant: "success", kind: "other" });
    assert.equal(notificationWriteSchema.safeParse({ title: "  " }).success, false);
    assert.equal(notificationWriteSchema.safeParse({ title: "Hi", kind: "event", eventDate: "28/11/2026" }).success, false);
    assert.equal(notificationWriteSchema.safeParse({ title: "Hi", variant: "warning" }).success, false);
  });
});
