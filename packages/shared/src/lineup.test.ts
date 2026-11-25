import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LINEUP_POSITION_Y,
  layoutLineupPlayers,
  lineupWriteSchema,
  validateLineupAddition,
  type PositionedLineupPlayer,
} from "./index.ts";

describe("lineup", () => {
  it("enforces position maximums with exact error messages", () => {
    const gkOnly = [{ playerId: "gk-1", position: "Goalkeeper" as const }];
    assert.equal(
      validateLineupAddition(gkOnly, { id: "gk-2", position: "Goalkeeper" }),
      "Only 1 player(s) allowed in Goalkeeper position",
    );

    const forwards = [1, 2, 3].map((n) => ({ playerId: `f-${n}`, position: "Forward" as const }));
    assert.equal(
      validateLineupAddition(forwards, { id: "f-4", position: "Forward" }),
      "Only 3 player(s) allowed in Forward position",
    );

    const defenders = [1, 2, 3, 4, 5].map((n) => ({ playerId: `d-${n}`, position: "Defender" as const }));
    assert.equal(
      validateLineupAddition(defenders, { id: "d-6", position: "Defender" }),
      "Only 5 player(s) allowed in Defender position",
    );

    const midfielders = [1, 2, 3, 4, 5].map((n) => ({ playerId: `m-${n}`, position: "Midfielder" as const }));
    assert.equal(
      validateLineupAddition(midfielders, { id: "m-6", position: "Midfielder" }),
      "Only 5 player(s) allowed in Midfielder position",
    );
  });

  it("enforces the 11-player total lineup limit before adding a 12th player", () => {
    const fullEleven = [
      { playerId: "gk-1", position: "Goalkeeper" as const },
      { playerId: "d-1", position: "Defender" as const },
      { playerId: "d-2", position: "Defender" as const },
      { playerId: "d-3", position: "Defender" as const },
      { playerId: "d-4", position: "Defender" as const },
      { playerId: "m-1", position: "Midfielder" as const },
      { playerId: "m-2", position: "Midfielder" as const },
      { playerId: "m-3", position: "Midfielder" as const },
      { playerId: "m-4", position: "Midfielder" as const },
      { playerId: "f-1", position: "Forward" as const },
      { playerId: "f-2", position: "Forward" as const },
    ];
    assert.equal(
      validateLineupAddition(fullEleven, { id: "f-3", position: "Forward" }),
      "Only 11 players allowed in the lineup",
    );
  });

  it("places players in position rows evenly from left to right and preserves dragged coordinates", () => {
    const raw: PositionedLineupPlayer[] = [
      { playerId: "gk-1", name: "Keeper", shirtNumber: 1, position: "Goalkeeper", x: 0, y: 0 },
      { playerId: "d-1", name: "Left Back", shirtNumber: 3, position: "Defender", x: 0, y: 0 },
      { playerId: "d-2", name: "Center Back", shirtNumber: 4, position: "Defender", x: 0, y: 0 },
      { playerId: "d-3", name: "Right Back", shirtNumber: 2, position: "Defender", x: 0, y: 0 },
      { playerId: "m-1", name: "Dragged Mid", shirtNumber: 8, position: "Midfielder", x: 64.5, y: 42.25, dragged: true },
      { playerId: "f-1", name: "Striker", shirtNumber: 9, position: "Forward", x: 0, y: 0 },
    ];

    const laidOut = layoutLineupPlayers(raw);
    const gk = laidOut.find((p) => p.playerId === "gk-1")!;
    assert.equal(gk.x, 50);
    assert.equal(gk.y, LINEUP_POSITION_Y.Goalkeeper);

    const d1 = laidOut.find((p) => p.playerId === "d-1")!;
    const d2 = laidOut.find((p) => p.playerId === "d-2")!;
    const d3 = laidOut.find((p) => p.playerId === "d-3")!;
    assert.equal(d1.y, LINEUP_POSITION_Y.Defender);
    assert.ok(d1.x < d2.x && d2.x < d3.x, "Defenders should be ordered from left to right");
    assert.equal(d2.x, 50);
    assert.ok(Math.abs((d2.x - d1.x) - (d3.x - d2.x)) < 0.05, "Defenders should be evenly spaced");

    const mid = laidOut.find((p) => p.playerId === "m-1")!;
    assert.equal(mid.x, 64.5);
    assert.equal(mid.y, 42.25);

    const fwd = laidOut.find((p) => p.playerId === "f-1")!;
    assert.equal(fwd.y, LINEUP_POSITION_Y.Forward);
  });

  it("validates lineup write payloads for matchday saving", () => {
    const valid = lineupWriteSchema.safeParse({
      jerseyUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      players: [
        { playerId: "p1", name: "Alex", shirtNumber: 1, position: "Goalkeeper", x: 50, y: 88 },
        { playerId: "p2", name: "Sam", shirtNumber: 9, position: "Forward", x: 50, y: 25 },
      ],
    });
    assert.equal(valid.success, true);

    const twoKeepers = lineupWriteSchema.safeParse({
      jerseyUrl: null,
      players: [
        { playerId: "p1", name: "Alex", shirtNumber: 1, position: "Goalkeeper", x: 50, y: 88 },
        { playerId: "p2", name: "Jordan", shirtNumber: 12, position: "Goalkeeper", x: 50, y: 88 },
      ],
    });
    assert.equal(twoKeepers.success, false);
  });
});
