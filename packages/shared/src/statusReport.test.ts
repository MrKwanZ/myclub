import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDayMonth, injuryStatusMessage, leaveStatusMessage, playerStatusReportSchema } from "./index.ts";

describe("player status reports", () => {
  it("builds the manager injury and leave messages", () => {
    assert.equal(
      injuryStatusMessage("Sam", "Ankle", "2026-11-15"),
      `Player Sam was reported Ankle and expected to be returned ${formatDayMonth("2026-11-15")}.`,
    );
    assert.equal(
      leaveStatusMessage("Sam", "2026-11-10", "2026-11-20"),
      `Player Sam was requested to leave during ${formatDayMonth("2026-11-10")} and ${formatDayMonth("2026-11-20")}.`,
    );
  });

  it("requires an injury area, a return date, and a valid leave period", () => {
    const missingInjury = playerStatusReportSchema.safeParse({
      kind: "injury",
      injuryArea: "  ",
      expectedReturnDate: null,
    });
    assert.equal(missingInjury.success, false);

    const backwardsLeave = playerStatusReportSchema.safeParse({
      kind: "leave",
      leaveStart: "2026-11-20",
      leaveEnd: "2026-11-10",
    });
    assert.equal(backwardsLeave.success, false);

    const injury = playerStatusReportSchema.safeParse({
      kind: "injury",
      injuryArea: "Ankle",
      expectedReturnDate: "2026-11-15",
      remarks: "Sore",
    });
    assert.equal(injury.success, true);
    if (injury.success) assert.equal(injury.data.remarks, "Sore");
  });
});
