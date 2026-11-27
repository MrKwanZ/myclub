import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvImportBlocked, parseClubCsv, parseCsv, parsedImportValues, type ClubImportPlayer, type EventWrite, type TransactionWrite } from "./index.ts";

describe("parseCsv", () => {
  it("keeps quoted commas, escaped quotes, and a leading BOM", () => {
    const rows = parseCsv('\uFEFFName,Notes\r\n"Doe, Jane","She said ""hi"""\r\n');
    assert.deepEqual(rows, [
      ["Name", "Notes"],
      ["Doe, Jane", 'She said "hi"'],
    ]);
  });

  it("keeps a newline inside quotes and drops a blank trailing row", () => {
    const rows = parseCsv('Item,Notes\nPitch,"line one\nline two"\n\n');
    assert.deepEqual(rows, [
      ["Item", "Notes"],
      ["Pitch", "line one\nline two"],
    ]);
  });
});

describe("roster csv", () => {
  it("matches header aliases and leaves unmatched attributes empty", () => {
    const parsed = parseClubCsv("roster", "Player,Shirt No.,Nickname\nAlex Keeper,1,AK\n");
    assert.equal(parsed.fileError, null);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]?.rawCells.name, "Alex Keeper");
    assert.equal(parsed.rows[0]?.rawCells.shirtNumber, "1");
    assert.equal(parsed.rows[0]?.rawCells.position, "");
    assert.equal(parsed.rows[0]?.rawCells.contact, "");
    assert.equal(parsed.rows[0]?.rawCells.status, "");
    assert.equal(parsed.rows[0]?.rawCells.goals, "");
    assert.equal(parsed.rows[0]?.rawCells.saves, "");
    const [player] = parsedImportValues<ClubImportPlayer>(parsed);
    assert.equal(player?.name, "Alex Keeper");
    assert.equal(player?.shirtNumber, 1);
    assert.equal(player?.position, "");
    assert.equal(player?.status, "active");
  });

  it("normalizes position and on-leave status", () => {
    const parsed = parseClubCsv("roster", "Full Name,Pos,Player Status,Phone\nSam,gk,On Leave,555-0100\n");
    const [player] = parsedImportValues<ClubImportPlayer>(parsed);
    assert.equal(player?.position, "Goalkeeper");
    assert.equal(player?.status, "left");
    assert.equal(player?.contact, "555-0100");
  });

  it("reads goals, assists, cards, minutes, and saves", () => {
    const parsed = parseClubCsv(
      "roster",
      "Name,Goals,Assists,Yellow Cards,Red Cards,Minutes,Saves\nAlex,12,4,1,0,810,6\n",
    );
    const [player] = parsedImportValues<ClubImportPlayer>(parsed);
    assert.equal(player?.goals, 12);
    assert.equal(player?.assists, 4);
    assert.equal(player?.yellowCards, 1);
    assert.equal(player?.redCards, 0);
    assert.equal(player?.playedMinutes, 810);
    assert.equal(player?.saves, 6);
  });

  it("blocks a stat that is above its limit", () => {
    const parsed = parseClubCsv("roster", "Name,Saves\nAlex,10000\n");
    assert.equal(csvImportBlocked(parsed), true);
    assert.match(parsed.rows[0]?.errors.saves ?? "", /0 to 9999/);
  });

  it("blocks a row with an invalid shirt number", () => {
    const parsed = parseClubCsv("roster", "Name,Number\nJane,100\n");
    assert.equal(csvImportBlocked(parsed), true);
    assert.match(parsed.rows[0]?.errors.shirtNumber ?? "", /0 to 99/);
    assert.equal(parsed.rows[0]?.parsed, null);
  });

  it("reports an empty file and a header-only file", () => {
    assert.equal(parseClubCsv("roster", " \n").fileError, "The CSV file is empty.");
    assert.equal(parseClubCsv("roster", "Name\n").fileError, "The CSV file has no data rows.");
  });
});

describe("finance csv", () => {
  it("normalizes dates, types, and currency amounts", () => {
    const parsed = parseClubCsv("finance", "Transaction Date,Category,Description,Total,Memo\n2026/12/01,Expense,Pitch hire,\"$1,200.50\",Night rental\n");
    const [row] = parsedImportValues<TransactionWrite>(parsed);
    assert.equal(row?.date, "2026-12-01");
    assert.equal(row?.type, "expense");
    assert.equal(row?.item, "Pitch hire");
    assert.equal(row?.amount, 1200.5);
    assert.equal(row?.notes, "Night rental");
  });

  it("blocks a row that is missing an amount", () => {
    const parsed = parseClubCsv("finance", "Date,Type,Item,Amount\n2026-12-01,income,Kit fund,\n");
    assert.equal(parsed.rows[0]?.errors.amount, "Amount is required.");
    assert.equal(csvImportBlocked(parsed), true);
  });
});

describe("events csv", () => {
  it("normalizes a match row and requires an opponent", () => {
    const parsed = parseClubCsv(
      "events",
      "Event,Type,Event Date,Kickoff,Venue,Vs\nDerby,game,2026-12-15,9:05,City Pitch,Rivals FC\n",
    );
    const [row] = parsedImportValues<EventWrite>(parsed);
    assert.equal(row?.name, "Derby");
    assert.equal(row?.type, "match");
    assert.equal(row?.date, "2026-12-15");
    assert.equal(row?.startTime, "09:05");
    assert.equal(row?.location, "City Pitch");
    assert.equal(row?.opponent, "Rivals FC");
    assert.equal(row?.notes, "");

    const missing = parseClubCsv("events", "Name,Type,Date,Time,Location\nDerby,match,2026-12-15,18:30,City Pitch\n");
    assert.equal(missing.rows[0]?.rawCells.opponent, "");
    assert.equal(missing.rows[0]?.errors.opponent, "Enter the opponent.");
    assert.equal(csvImportBlocked(missing), true);
  });

  it("rejects a training row that includes a score", () => {
    const parsed = parseClubCsv(
      "events",
      "Name,Type,Date,Start,Location,Score For\nTuesday,training,2026-12-02,19:00,Cage,1\n",
    );
    assert.match(parsed.rows[0]?.errors.type ?? "", /does not have an opponent/);
  });
});
