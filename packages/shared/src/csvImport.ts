import { z } from "zod";

import { canonicalPosition, eventTypeLabel, eventTypes, playerPositions, playerStatuses } from "./labels";

export const csvImportRowLimit = 500;

const shirtNumberSchema = z
  .number({ invalid_type_error: "Shirt number must be a whole number." })
  .int("Shirt number must be a whole number.")
  .min(0, "Shirt number must be from 0 to 99.")
  .max(99, "Shirt number must be from 0 to 99.")
  .nullable()
  .optional();

const contactSchema = z
  .string()
  .trim()
  .max(120, "Contact is too long.")
  .regex(/^[0-9-]*$/, "Contact can only include numbers and hyphens.");

const positionSchema = z
  .string()
  .trim()
  .max(40, "Position is too long.")
  .transform(canonicalPosition)
  .refine(
    (value) => value === "" || (playerPositions as readonly string[]).includes(value),
    "Choose Goalkeeper, Defender, Midfielder, or Forward.",
  );

const countSchema = (max: number) =>
  z.number().int("Use a whole number.").min(0, "Use a whole number from 0.").max(max, `Use a whole number from 0 to ${max}.`);

/** Roster rows imported from CSV. Injury and leave details are not part of this import. */
export const clubImportPlayerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80, "Name is too long."),
  position: positionSchema.optional().default(""),
  shirtNumber: shirtNumberSchema,
  contact: contactSchema.optional().default(""),
  status: z.enum(playerStatuses).optional().default("active"),
  goals: countSchema(999).optional().default(0),
  assists: countSchema(999).optional().default(0),
  yellowCards: countSchema(999).optional().default(0),
  redCards: countSchema(999).optional().default(0),
  playedMinutes: countSchema(99999).optional().default(0),
  saves: countSchema(9999).optional().default(0),
});

export type ClubImportPlayer = z.infer<typeof clubImportPlayerSchema>;
export type CsvImportKind = "roster" | "finance" | "events";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time as HH:mm.");
const moneySchema = z
  .number({ invalid_type_error: "Enter an amount." })
  .positive("Amount must be greater than zero.")
  .max(1_000_000_000, "Amount is too large.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, "Use at most two decimal places.");

const financeRowSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: moneySchema,
  date: dateSchema,
  item: z.string().trim().min(1, "Item is required.").max(80, "Item is too long."),
  notes: z.string().trim().max(2000, "Notes are too long.").optional().default(""),
});

const eventRowSchema = z.object({
  name: z.string().trim().min(1, "Event name is required.").max(120, "Event name is too long."),
  type: z.enum(eventTypes),
  date: dateSchema,
  startTime: timeSchema,
  location: z.string().trim().min(1, "Location is required.").max(160, "Location is too long."),
  notes: z.string().trim().max(2000, "Notes are too long.").optional().default(""),
  opponent: z.string().trim().max(120, "Opponent is too long.").nullable().optional(),
  scoreFor: z.number().int().min(0).max(99).nullable().optional(),
  scoreAgainst: z.number().int().min(0).max(99).nullable().optional(),
});

export interface CsvImportColumn {
  key: string;
  label: string;
}

export interface CsvImportRow {
  rawCells: Record<string, string>;
  parsed: unknown;
  errors: Record<string, string>;
}

export interface ParsedClubCsv {
  kind: CsvImportKind;
  columns: CsvImportColumn[];
  rows: CsvImportRow[];
  fileError: string | null;
}

const rosterColumns: CsvImportColumn[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Position" },
  { key: "shirtNumber", label: "No." },
  { key: "contact", label: "Contact" },
  { key: "status", label: "Status" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "yellowCards", label: "Yellow cards" },
  { key: "redCards", label: "Red cards" },
  { key: "playedMinutes", label: "Minutes" },
  { key: "saves", label: "Saves" },
];

const financeColumns: CsvImportColumn[] = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "item", label: "Item" },
  { key: "amount", label: "Amount" },
  { key: "notes", label: "Notes" },
];

const eventColumns: CsvImportColumn[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "date", label: "Date" },
  { key: "startTime", label: "Start time" },
  { key: "location", label: "Location" },
  { key: "opponent", label: "Opponent" },
  { key: "scoreFor", label: "Score for" },
  { key: "scoreAgainst", label: "Score against" },
  { key: "notes", label: "Notes" },
];

const rosterAliases: Record<string, string> = {
  player: "name",
  "player name": "name",
  name: "name",
  "full name": "name",
  pos: "position",
  position: "position",
  role: "position",
  "shirt no": "shirtNumber",
  "shirt number": "shirtNumber",
  no: "shirtNumber",
  number: "shirtNumber",
  jersey: "shirtNumber",
  "jersey number": "shirtNumber",
  contact: "contact",
  phone: "contact",
  tel: "contact",
  mobile: "contact",
  status: "status",
  "player status": "status",
  goals: "goals",
  goal: "goals",
  assists: "assists",
  assist: "assists",
  "yellow cards": "yellowCards",
  yellowcards: "yellowCards",
  yellow: "yellowCards",
  yellows: "yellowCards",
  yc: "yellowCards",
  "red cards": "redCards",
  redcards: "redCards",
  red: "redCards",
  reds: "redCards",
  rc: "redCards",
  "played minutes": "playedMinutes",
  playedminutes: "playedMinutes",
  "minutes played": "playedMinutes",
  minutes: "playedMinutes",
  mins: "playedMinutes",
  saves: "saves",
  save: "saves",
};

const rosterStatLimits: Record<string, number> = {
  goals: 999,
  assists: 999,
  yellowCards: 999,
  redCards: 999,
  playedMinutes: 99999,
  saves: 9999,
};

const financeAliases: Record<string, string> = {
  date: "date",
  "transaction date": "date",
  type: "type",
  category: "type",
  kind: "type",
  item: "item",
  description: "item",
  title: "item",
  name: "item",
  amount: "amount",
  value: "amount",
  price: "amount",
  total: "amount",
  notes: "notes",
  note: "notes",
  remarks: "notes",
  memo: "notes",
};

const eventAliases: Record<string, string> = {
  name: "name",
  event: "name",
  "event name": "name",
  title: "name",
  type: "type",
  "event type": "type",
  category: "type",
  date: "date",
  "event date": "date",
  "start time": "startTime",
  time: "startTime",
  kickoff: "startTime",
  start: "startTime",
  location: "location",
  venue: "location",
  place: "location",
  pitch: "location",
  opponent: "opponent",
  vs: "opponent",
  against: "opponent",
  "score for": "scoreFor",
  "goals for": "scoreFor",
  for: "scoreFor",
  "home score": "scoreFor",
  "score against": "scoreAgainst",
  "goals against": "scoreAgainst",
  "away score": "scoreAgainst",
  notes: "notes",
  note: "notes",
  remarks: "notes",
};

const statusAliases: Record<string, (typeof playerStatuses)[number]> = {
  active: "active",
  injured: "injured",
  injury: "injured",
  left: "left",
  leave: "left",
  "on leave": "left",
};

const transactionTypeAliases: Record<string, "income" | "expense"> = {
  income: "income",
  in: "income",
  credit: "income",
  expense: "expense",
  expenses: "expense",
  out: "expense",
  debit: "expense",
};

const eventTypeAliases: Record<string, (typeof eventTypes)[number]> = {
  training: "training",
  practice: "training",
  session: "training",
  match: "match",
  game: "match",
  fixture: "match",
  leisure: "leisure",
  social: "leisure",
  friendly: "friendly",
};

export function parseClubCsv(kind: CsvImportKind, text: string): ParsedClubCsv {
  const columns = columnsFor(kind);
  const table = parseCsv(text);
  if (table.length === 0) {
    return { kind, columns, rows: [], fileError: "The CSV file is empty." };
  }
  const [headerRow, ...dataRows] = table;
  const fieldIndex = matchHeaders(headerRow ?? [], aliasesFor(kind));
  const filled = dataRows.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (filled.length === 0) {
    return { kind, columns, rows: [], fileError: "The CSV file has no data rows." };
  }
  if (filled.length > csvImportRowLimit) {
    return { kind, columns, rows: [], fileError: `A CSV file can include at most ${csvImportRowLimit} rows.` };
  }
  const rows = filled.map((row) => parseRow(kind, columns, fieldIndex, row));
  return { kind, columns, rows, fileError: null };
}

export function csvImportBlocked(parsed: ParsedClubCsv | null): boolean {
  if (!parsed || parsed.fileError || parsed.rows.length === 0) return true;
  return parsed.rows.some((row) => Object.keys(row.errors).length > 0);
}

export function parsedImportValues<T>(parsed: ParsedClubCsv): T[] {
  if (csvImportBlocked(parsed)) return [];
  return parsed.rows.map((row) => row.parsed as T);
}

/** RFC 4180 reader. Quoted commas, escaped quotes, and newlines inside quotes are kept. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  if (input.trim() === "") return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      continue;
    }
    field += char;
  }
  if (inQuotes || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1]?.every((cell) => cell.trim() === "")) rows.pop();
  return rows;
}

function columnsFor(kind: CsvImportKind) {
  if (kind === "roster") return rosterColumns;
  if (kind === "finance") return financeColumns;
  return eventColumns;
}

function aliasesFor(kind: CsvImportKind) {
  if (kind === "roster") return rosterAliases;
  if (kind === "finance") return financeAliases;
  return eventAliases;
}

function matchHeaders(headers: string[], aliases: Record<string, string>) {
  const fieldIndex: Record<string, number> = {};
  headers.forEach((header, index) => {
    const field = aliases[normalizeHeader(header)];
    if (field && fieldIndex[field] === undefined) fieldIndex[field] = index;
  });
  return fieldIndex;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[._/&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawCellsFor(columns: CsvImportColumn[], fieldIndex: Record<string, number>, row: string[]) {
  const rawCells: Record<string, string> = {};
  for (const column of columns) {
    const index = fieldIndex[column.key];
    rawCells[column.key] = index === undefined ? "" : (row[index] ?? "").trim();
  }
  return rawCells;
}

function parseRow(
  kind: CsvImportKind,
  columns: CsvImportColumn[],
  fieldIndex: Record<string, number>,
  row: string[],
): CsvImportRow {
  const rawCells = rawCellsFor(columns, fieldIndex, row);
  if (kind === "roster") return { rawCells, ...parseRosterRow(rawCells) };
  if (kind === "finance") return { rawCells, ...parseFinanceRow(rawCells) };
  return { rawCells, ...parseEventRow(rawCells) };
}

function issuesToErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "row");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function parseRosterRow(cells: Record<string, string>): Pick<CsvImportRow, "parsed" | "errors"> {
  const errors: Record<string, string> = {};
  const statusText = cells.status?.trim().toLowerCase() ?? "";
  const status = statusText ? statusAliases[statusText] : undefined;
  if (statusText && !status) errors.status = "Status must be active, injured, or on leave.";

  let shirtNumber: number | null | undefined;
  const shirtText = cells.shirtNumber?.trim() ?? "";
  if (shirtText) {
    if (!/^\d+$/.test(shirtText)) errors.shirtNumber = "Shirt number must be a whole number.";
    else shirtNumber = Number(shirtText);
  }

  const stats: Record<string, number> = {};
  for (const [key, max] of Object.entries(rosterStatLimits)) {
    const text = cells[key]?.trim() ?? "";
    if (!text) continue;
    if (!/^\d+$/.test(text) || Number(text) > max) {
      errors[key] = `Use a whole number from 0 to ${max}.`;
      continue;
    }
    stats[key] = Number(text);
  }

  const result = clubImportPlayerSchema.safeParse({
    name: cells.name ?? "",
    position: cells.position ?? "",
    contact: (cells.contact ?? "").replace(/\s+/g, ""),
    ...stats,
    ...(shirtNumber !== undefined ? { shirtNumber } : {}),
    ...(status ? { status } : {}),
  });
  if (!result.success) Object.assign(errors, issuesToErrors(result.error));
  if (!result.success || Object.keys(errors).length > 0) return { parsed: null, errors };
  return { parsed: result.data, errors };
}

function normalizeDate(value: string) {
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function parseAmount(value: string) {
  const cleaned = value.trim().replace(/[$£€,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseFinanceRow(cells: Record<string, string>): Pick<CsvImportRow, "parsed" | "errors"> {
  const errors: Record<string, string> = {};
  const date = normalizeDate(cells.date ?? "");
  if (!date) errors.date = (cells.date ?? "").trim() ? "Use a date as YYYY-MM-DD." : "Date is required.";
  const type = transactionTypeAliases[(cells.type ?? "").trim().toLowerCase()];
  if (!type) errors.type = (cells.type ?? "").trim() ? "Type must be income or expense." : "Type is required.";
  const amount = parseAmount(cells.amount ?? "");
  if (amount == null) errors.amount = (cells.amount ?? "").trim() ? "Enter an amount." : "Amount is required.";

  const result = financeRowSchema.safeParse({
    type: type ?? "income",
    amount: amount ?? 1,
    date: date ?? "2000-01-01",
    item: cells.item ?? "",
    notes: cells.notes ?? "",
  });
  if (!result.success) {
    for (const [key, message] of Object.entries(issuesToErrors(result.error))) {
      if (key === "item" || key === "notes" || ((key === "date" || key === "type" || key === "amount") && !errors[key])) {
        errors[key] = message;
      }
    }
  }
  if (!date || !type || amount == null || !result.success || Object.keys(errors).length > 0) return { parsed: null, errors };
  return { parsed: result.data, errors };
}

function parseScore(value: string): { score: number } | { empty: true } | { invalid: true } {
  const trimmed = value.trim();
  if (!trimmed) return { empty: true };
  if (!/^\d+$/.test(trimmed)) return { invalid: true };
  const score = Number(trimmed);
  if (score > 99) return { invalid: true };
  return { score };
}

function parseEventRow(cells: Record<string, string>): Pick<CsvImportRow, "parsed" | "errors"> {
  const errors: Record<string, string> = {};
  const type = eventTypeAliases[(cells.type ?? "").trim().toLowerCase()];
  if (!type) errors.type = (cells.type ?? "").trim() ? "Event type must be training, match, leisure, or friendly." : "Event type is required.";
  const date = normalizeDate(cells.date ?? "");
  if (!date) errors.date = (cells.date ?? "").trim() ? "Use a date as YYYY-MM-DD." : "Date is required.";
  const startTime = normalizeTime(cells.startTime ?? "");
  if (!startTime) errors.startTime = (cells.startTime ?? "").trim() ? "Use a time as HH:mm." : "Start time is required.";

  const scoreFor = parseScore(cells.scoreFor ?? "");
  const scoreAgainst = parseScore(cells.scoreAgainst ?? "");
  if ("invalid" in scoreFor) errors.scoreFor = "Score must be a whole number from 0 to 99.";
  if ("invalid" in scoreAgainst) errors.scoreAgainst = "Score must be a whole number from 0 to 99.";
  const scoreForValue = "score" in scoreFor ? scoreFor.score : null;
  const scoreAgainstValue = "score" in scoreAgainst ? scoreAgainst.score : null;
  const opponent = (cells.opponent ?? "").trim();

  applyEventRules(
    {
      type: type ?? "",
      opponent: opponent || null,
      scoreFor: scoreForValue,
      scoreAgainst: scoreAgainstValue,
    },
    errors,
  );

  const result = eventRowSchema.safeParse({
    name: cells.name ?? "",
    type: type ?? "training",
    date: date ?? "2000-01-01",
    startTime: startTime ?? "00:00",
    location: cells.location ?? "",
    notes: cells.notes ?? "",
    opponent: opponent || null,
    scoreFor: scoreForValue,
    scoreAgainst: scoreAgainstValue,
  });
  if (!result.success) {
    for (const [key, message] of Object.entries(issuesToErrors(result.error))) {
      if (!errors[key] && key !== "type" && key !== "date" && key !== "startTime") errors[key] = message;
      if (!errors[key] && (key === "type" || key === "date" || key === "startTime") && type && date && startTime) {
        errors[key] = message;
      }
    }
  }
  if (!type || !date || !startTime || !result.success || Object.keys(errors).length > 0) return { parsed: null, errors };
  return { parsed: result.data, errors };
}

function applyEventRules(
  value: { type: string; opponent: string | null; scoreFor: number | null; scoreAgainst: number | null },
  errors: Record<string, string>,
) {
  if (value.type === "match" && !value.opponent) errors.opponent ??= "Enter the opponent.";
  if (
    (value.type === "training" || value.type === "leisure") &&
    (value.opponent || value.scoreFor != null || value.scoreAgainst != null)
  ) {
    errors.type ??= `${eventTypeLabel(value.type)} does not have an opponent, score, or result.`;
  }
  if (value.type === "friendly" && (value.scoreFor != null || value.scoreAgainst != null)) {
    errors.scoreFor ??= "A friendly does not have a score or result.";
  }
  if (value.type === "match" && (value.scoreFor == null) !== (value.scoreAgainst == null)) {
    errors.scoreFor ??= "Enter both scores.";
  }
}
