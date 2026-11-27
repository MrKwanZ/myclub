import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardGreeting,
  incomingEventMessage,
  incomingEventTitle,
  scoreResultClass,
  shouldRemindEventReply,
} from "./index.ts";

describe("dashboard greeting", () => {
  const morning = new Date(2026, 10, 26, 8, 15);
  const noon = new Date(2026, 10, 26, 12, 0);
  const evening = new Date(2026, 10, 26, 18, 0);

  it("greets by the local hour and the person's name", () => {
    assert.equal(dashboardGreeting("Alex", morning), "Good morning, Alex");
    assert.equal(dashboardGreeting("Alex", new Date(2026, 10, 26, 11, 59)), "Good morning, Alex");
    assert.equal(dashboardGreeting("Alex", noon), "Good afternoon, Alex");
    assert.equal(dashboardGreeting("Alex", new Date(2026, 10, 26, 17, 59)), "Good afternoon, Alex");
    assert.equal(dashboardGreeting("Alex", evening), "Good evening, Alex");
    assert.equal(dashboardGreeting("  Sam Striker  ", morning), "Good morning, Sam Striker");
  });

  it("omits the name when it is blank", () => {
    assert.equal(dashboardGreeting("   ", morning), "Good morning");
  });
});

describe("match score color", () => {
  it("uses green for a win, red for a loss, and the default color for a draw", () => {
    assert.equal(scoreResultClass("win"), "score-win");
    assert.equal(scoreResultClass("loss"), "score-loss");
    assert.equal(scoreResultClass("draw"), undefined);
    assert.equal(scoreResultClass(null), undefined);
  });
});

describe("incoming event notice", () => {
  const event = { name: "Notify Training", date: "2026-11-30", startTime: "19:00" };

  it("names the event and when it starts", () => {
    assert.equal(incomingEventTitle, "Incoming Event");
    assert.equal(
      incomingEventMessage(event),
      "Incoming Notify Training on Monday 30 November, 19:00.",
    );
  });

  it("keeps the reply reminder only when asked", () => {
    assert.equal(
      incomingEventMessage(event, true),
      "Incoming Notify Training on Monday 30 November, 19:00. Please reply your availability",
    );
  });

  it("falls back when the event has no name", () => {
    assert.equal(
      incomingEventMessage({ name: "  ", date: "2026-11-30", startTime: "19:00" }),
      "Incoming the event on Monday 30 November, 19:00.",
    );
  });

  it("reminds only a linked player who has not replied", () => {
    assert.equal(shouldRemindEventReply("player", true, "unanswered"), true);
    assert.equal(shouldRemindEventReply("player", true, null), true);
    assert.equal(shouldRemindEventReply("player", true, "present"), false);
    assert.equal(shouldRemindEventReply("player", false, "unanswered"), false);
    assert.equal(shouldRemindEventReply("manager", true, "unanswered"), false);
  });
});
