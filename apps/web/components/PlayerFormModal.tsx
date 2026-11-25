"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { api } from "@/lib/api";
import { validateDateInput, validateIntInput } from "@/lib/fieldValidation";
import { notifyDanger, notifyPlayerAdded, notifySaved, notifyZod } from "@/lib/notify";
import {
  canonicalPosition,
  playerPositions,
  playerStatusLabel,
  playerStatuses,
  playerWriteSchema,
  type Player,
} from "@myclub/shared";
import { Calendar, DateField, DatePicker, DateRangePicker, FieldError, Form, Input, Label, Modal, NumberField, RangeCalendar, TextField, Button } from "@heroui/react";
import { parseDate, type CalendarDate, type DateValue } from "@internationalized/date";
import { useEffect, useState } from "react";

export type PlayerForm = {
  name: string;
  position: string;
  shirtNumber: string;
  contact: string;
  status: string;
  goals: string;
  assists: string;
  yellowCards: number;
  redCards: number;
  playedMinutes: number;
  saves: number;
  injuryArea: string;
  expectedReturnDate: string;
  leaveStart: string;
  leaveEnd: string;
};

export const emptyPlayerForm: PlayerForm = {
  name: "",
  position: "",
  shirtNumber: "",
  contact: "",
  status: "active",
  goals: "",
  assists: "",
  yellowCards: 0,
  redCards: 0,
  playedMinutes: 0,
  saves: 0,
  injuryArea: "",
  expectedReturnDate: "",
  leaveStart: "",
  leaveEnd: "",
};

const statusOptions = playerStatuses.map((status) => ({ id: status, label: playerStatusLabel(status) }));
const positionOptions = playerPositions.map((position) => ({ id: position, label: position }));

export function formFromPlayer(player: Player): PlayerForm {
  return {
    name: player.name,
    position: canonicalPosition(player.position),
    shirtNumber: player.shirtNumber == null ? "" : String(player.shirtNumber),
    contact: player.contact,
    status: player.status,
    goals: String(player.goals),
    assists: String(player.assists),
    yellowCards: player.yellowCards ?? 0,
    redCards: player.redCards ?? 0,
    playedMinutes: player.playedMinutes ?? 0,
    saves: player.saves ?? 0,
    injuryArea: player.injuryArea,
    expectedReturnDate: player.expectedReturnDate ?? "",
    leaveStart: player.leaveStart ?? "",
    leaveEnd: player.leaveEnd ?? "",
  };
}

export type PlayerFieldKey =
  | "name"
  | "shirtNumber"
  | "contact"
  | "goals"
  | "assists"
  | "yellowCards"
  | "redCards"
  | "playedMinutes"
  | "saves"
  | "injuryArea"
  | "expectedReturnDate"
  | "leaveStart"
  | "leaveEnd";
export type PlayerFieldErrors = Partial<Record<PlayerFieldKey, string>>;

function validateNonNegInt(value: number, label: string, max: number): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return `${label} must be a whole number.`;
  if (value < 0 || value > max) return `${label} must be from 0 to ${max}.`;
  return null;
}

export function validatePlayerField(field: PlayerFieldKey, input: PlayerForm): string | null {
  switch (field) {
    case "name":
      if (!input.name.trim()) return "Name is required.";
      return input.name.trim().length > 80 ? "Name is too long." : null;
    case "shirtNumber":
      return validateIntInput(input.shirtNumber, {
        min: 0,
        max: 99,
        rangeMessage: "Shirt number must be from 0 to 99.",
        intMessage: "Shirt number must be a whole number.",
      });
    case "contact":
      if (input.contact.trim().length > 120) return "Contact is too long.";
      return /^[0-9-]*$/.test(input.contact.trim()) ? null : "Contact can only include numbers and hyphens.";
    case "goals":
      return validateIntInput(input.goals, {
        min: 0,
        max: 999,
        rangeMessage: "Goals must be from 0 to 999.",
      });
    case "assists":
      return validateIntInput(input.assists, {
        min: 0,
        max: 999,
        rangeMessage: "Assists must be from 0 to 999.",
      });
    case "yellowCards":
      return validateNonNegInt(input.yellowCards, "Yellow cards", 999);
    case "redCards":
      return validateNonNegInt(input.redCards, "Red cards", 999);
    case "playedMinutes":
      return validateNonNegInt(input.playedMinutes, "Played minutes", 99999);
    case "saves":
      if (canonicalPosition(input.position) !== "Goalkeeper") return null;
      return validateNonNegInt(input.saves, "Saves", 9999);
    case "injuryArea":
      if (input.status !== "injured") return null;
      if (!input.injuryArea.trim()) return "Injury Area is required.";
      return input.injuryArea.trim().length > 80 ? "Injury area is too long." : null;
    case "expectedReturnDate":
      if (input.status !== "injured") return null;
      return validateDateInput(input.expectedReturnDate, false);
    case "leaveStart":
      if (input.status !== "left") return null;
      return validateDateInput(input.leaveStart, false);
    case "leaveEnd":
      if (input.status !== "left") return null;
      if ((input.leaveStart && !input.leaveEnd) || (!input.leaveStart && input.leaveEnd)) {
        return "Choose leave period.";
      }
      if (input.leaveStart && input.leaveEnd && input.leaveEnd < input.leaveStart) {
        return "Leave until must be on or after the start.";
      }
      return validateDateInput(input.leaveEnd, false);
  }
}

function dateValue(iso: string): CalendarDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

function isoFromDate(value: DateValue | null): string {
  return value ? value.toString() : "";
}

export function parsePlayerForm(input: PlayerForm) {
  const shirt = input.shirtNumber.trim();
  const injured = input.status === "injured";
  const isGoalkeeper = canonicalPosition(input.position) === "Goalkeeper";
  return playerWriteSchema.safeParse({
    name: input.name,
    position: input.position,
    contact: input.contact,
    status: input.status,
    shirtNumber: shirt === "" ? null : Number(shirt),
    goals: input.goals.trim() === "" ? 0 : Number(input.goals),
    assists: input.assists.trim() === "" ? 0 : Number(input.assists),
    yellowCards: Number.isFinite(input.yellowCards) ? input.yellowCards : 0,
    redCards: Number.isFinite(input.redCards) ? input.redCards : 0,
    playedMinutes: Number.isFinite(input.playedMinutes) ? input.playedMinutes : 0,
    saves: isGoalkeeper && Number.isFinite(input.saves) ? input.saves : 0,
    injuryArea: injured ? input.injuryArea : "",
    expectedReturnDate: injured && input.expectedReturnDate ? input.expectedReturnDate : null,
    leaveStart: input.status === "left" && input.leaveStart ? input.leaveStart : null,
    leaveEnd: input.status === "left" && input.leaveEnd ? input.leaveEnd : null,
  });
}

export function PlayerFormModal({
  editor,
  token,
  clubId,
  onClose,
  onSaved,
}: {
  editor: "create" | Player | null;
  token: string | null;
  clubId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<PlayerForm>(emptyPlayerForm);
  const [fieldErrors, setFieldErrors] = useState<PlayerFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (editor === null) return;
    setForm(editor === "create" ? emptyPlayerForm : formFromPlayer(editor));
    setFieldErrors({});
    setError(null);
  }, [editor]);

  function updateFieldError(field: PlayerFieldKey, message: string | null) {
    setFieldErrors((current) => {
      if (!message) {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      }
      return { ...current, [field]: message };
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !clubId || !editor) return;
    const nextErrors: PlayerFieldErrors = {};
    const keys: PlayerFieldKey[] = [
      "name",
      "shirtNumber",
      "contact",
      "goals",
      "assists",
      "yellowCards",
      "redCards",
      "playedMinutes",
      "saves",
      "injuryArea",
      "expectedReturnDate",
      "leaveStart",
      "leaveEnd",
    ];
    for (const key of keys) {
      const msg = validatePlayerField(key, form);
      if (msg) nextErrors[key] = msg;
    }
    setFieldErrors(nextErrors);
    const parsed = parsePlayerForm(form);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the player.";
      setError(message);
      notifyZod(parsed.error, message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (editor === "create") {
        await api.createPlayer(token, clubId, parsed.data);
        notifyPlayerAdded();
      } else {
        await api.updatePlayer(token, clubId, editor.id, parsed.data);
        notifySaved();
      }
      onClose();
      setForm(emptyPlayerForm);
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the player.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  const injured = form.status === "injured";
  const isGoalkeeper = canonicalPosition(form.position) === "Goalkeeper";

  return (
    <Modal.Backdrop isOpen={editor !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Modal.Container>
        <Modal.Dialog className="modal-form">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{editor === "create" ? "Create Player" : "Edit Player"}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <Form className="form-grid" onSubmit={onSubmit}>
              <TextField
                name="name"
                isInvalid={Boolean(fieldErrors.name)}
                value={form.name}
                onChange={(value) => {
                  const next = { ...form, name: value };
                  setForm(next);
                  if (fieldErrors.name) updateFieldError("name", validatePlayerField("name", next));
                }}
                onBlur={() => updateFieldError("name", validatePlayerField("name", form))}
              >
                <Label>Name</Label>
                <Input />
                <FieldError>{fieldErrors.name}</FieldError>
              </TextField>
              <div className="field">
                <span>Position</span>
                <ChoiceMenu
                  label="Position"
                  value={form.position}
                  options={positionOptions}
                  onChange={(position) => setForm({ ...form, position })}
                />
              </div>
              <TextField
                name="shirtNumber"
                type="number"
                isInvalid={Boolean(fieldErrors.shirtNumber)}
                value={form.shirtNumber}
                onChange={(value) => {
                  const next = { ...form, shirtNumber: value };
                  setForm(next);
                  if (fieldErrors.shirtNumber) updateFieldError("shirtNumber", validatePlayerField("shirtNumber", next));
                }}
                onBlur={() => updateFieldError("shirtNumber", validatePlayerField("shirtNumber", form))}
              >
                <Label>Shirt number</Label>
                <Input min={0} max={99} />
                <FieldError>{fieldErrors.shirtNumber}</FieldError>
              </TextField>
              <TextField
                name="contact"
                type="text"
                isInvalid={Boolean(fieldErrors.contact)}
                value={form.contact}
                onChange={(value) => {
                  const next = { ...form, contact: value.replace(/[^0-9-]/g, "") };
                  setForm(next);
                  if (fieldErrors.contact) updateFieldError("contact", validatePlayerField("contact", next));
                }}
                onBlur={() => updateFieldError("contact", validatePlayerField("contact", form))}
              >
                <Label>Contact</Label>
                <Input inputMode="tel" />
                <FieldError>{fieldErrors.contact}</FieldError>
              </TextField>
              <TextField
                name="goals"
                type="number"
                isInvalid={Boolean(fieldErrors.goals)}
                value={form.goals}
                onChange={(value) => {
                  const next = { ...form, goals: value };
                  setForm(next);
                  if (fieldErrors.goals) updateFieldError("goals", validatePlayerField("goals", next));
                }}
                onBlur={() => updateFieldError("goals", validatePlayerField("goals", form))}
              >
                <Label>Goals</Label>
                <Input min={0} />
                <FieldError>{fieldErrors.goals}</FieldError>
              </TextField>
              <TextField
                name="assists"
                type="number"
                isInvalid={Boolean(fieldErrors.assists)}
                value={form.assists}
                onChange={(value) => {
                  const next = { ...form, assists: value };
                  setForm(next);
                  if (fieldErrors.assists) updateFieldError("assists", validatePlayerField("assists", next));
                }}
                onBlur={() => updateFieldError("assists", validatePlayerField("assists", form))}
              >
                <Label>Assists</Label>
                <Input min={0} />
                <FieldError>{fieldErrors.assists}</FieldError>
              </TextField>
              <NumberField
                name="yellowCards"
                minValue={0}
                maxValue={999}
                isInvalid={Boolean(fieldErrors.yellowCards)}
                value={form.yellowCards}
                onChange={(value) => {
                  const safe = Number.isNaN(value) ? 0 : value;
                  const next = { ...form, yellowCards: safe };
                  setForm(next);
                  if (fieldErrors.yellowCards) updateFieldError("yellowCards", validatePlayerField("yellowCards", next));
                }}
                onBlur={() => updateFieldError("yellowCards", validatePlayerField("yellowCards", form))}
              >
                <Label>Yellow cards</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
                <FieldError>{fieldErrors.yellowCards}</FieldError>
              </NumberField>
              <NumberField
                name="redCards"
                minValue={0}
                maxValue={999}
                isInvalid={Boolean(fieldErrors.redCards)}
                value={form.redCards}
                onChange={(value) => {
                  const safe = Number.isNaN(value) ? 0 : value;
                  const next = { ...form, redCards: safe };
                  setForm(next);
                  if (fieldErrors.redCards) updateFieldError("redCards", validatePlayerField("redCards", next));
                }}
                onBlur={() => updateFieldError("redCards", validatePlayerField("redCards", form))}
              >
                <Label>Red cards</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
                <FieldError>{fieldErrors.redCards}</FieldError>
              </NumberField>
              <NumberField
                name="playedMinutes"
                minValue={0}
                maxValue={99999}
                isInvalid={Boolean(fieldErrors.playedMinutes)}
                value={form.playedMinutes}
                onChange={(value) => {
                  const safe = Number.isNaN(value) ? 0 : value;
                  const next = { ...form, playedMinutes: safe };
                  setForm(next);
                  if (fieldErrors.playedMinutes) updateFieldError("playedMinutes", validatePlayerField("playedMinutes", next));
                }}
                onBlur={() => updateFieldError("playedMinutes", validatePlayerField("playedMinutes", form))}
              >
                <Label>Played minutes</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
                <FieldError>{fieldErrors.playedMinutes}</FieldError>
              </NumberField>
              {isGoalkeeper ? (
                <NumberField
                  name="saves"
                  minValue={0}
                  maxValue={9999}
                  isInvalid={Boolean(fieldErrors.saves)}
                  value={form.saves}
                  onChange={(value) => {
                    const safe = Number.isNaN(value) ? 0 : value;
                    const next = { ...form, saves: safe };
                    setForm(next);
                    if (fieldErrors.saves) updateFieldError("saves", validatePlayerField("saves", next));
                  }}
                  onBlur={() => updateFieldError("saves", validatePlayerField("saves", form))}
                >
                  <Label>Saves</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                  <FieldError>{fieldErrors.saves}</FieldError>
                </NumberField>
              ) : null}
              <div className="field">
                <span>Status</span>
                <ChoiceMenu
                  label="Status"
                  value={form.status}
                  options={statusOptions}
                  onChange={(status) => {
                    const next = {
                      ...form,
                      status,
                      ...(status === "injured" ? {} : { injuryArea: "", expectedReturnDate: "" }),
                      ...(status === "left" ? {} : { leaveStart: "", leaveEnd: "" }),
                    };
                    setForm(next);
                    if (status !== "injured") {
                      updateFieldError("injuryArea", null);
                      updateFieldError("expectedReturnDate", null);
                    }
                    if (status !== "left") {
                      updateFieldError("leaveStart", null);
                      updateFieldError("leaveEnd", null);
                    }
                  }}
                />
              </div>
              {injured ? (
                <>
                  <TextField
                    name="injuryArea"
                    isInvalid={Boolean(fieldErrors.injuryArea)}
                    value={form.injuryArea}
                    onChange={(value) => {
                      const next = { ...form, injuryArea: value };
                      setForm(next);
                      if (fieldErrors.injuryArea) updateFieldError("injuryArea", validatePlayerField("injuryArea", next));
                    }}
                    onBlur={() => updateFieldError("injuryArea", validatePlayerField("injuryArea", form))}
                  >
                    <Label>Injury Area</Label>
                    <Input />
                    <FieldError>{fieldErrors.injuryArea}</FieldError>
                  </TextField>
                  <ReturnDateFields
                    value={form.expectedReturnDate}
                    error={fieldErrors.expectedReturnDate}
                    onChange={(expectedReturnDate) => {
                      const next = { ...form, expectedReturnDate };
                      setForm(next);
                      if (fieldErrors.expectedReturnDate) {
                        updateFieldError("expectedReturnDate", validatePlayerField("expectedReturnDate", next));
                      }
                    }}
                  />
                </>
              ) : null}
              {form.status === "left" ? (
                <LeaveDateFields
                  start={form.leaveStart}
                  end={form.leaveEnd}
                  error={fieldErrors.leaveEnd ?? fieldErrors.leaveStart}
                  onChange={(leaveStart, leaveEnd) => {
                    const next = { ...form, leaveStart, leaveEnd };
                    setForm(next);
                    if (fieldErrors.leaveStart || fieldErrors.leaveEnd) {
                      updateFieldError("leaveStart", validatePlayerField("leaveStart", next));
                      updateFieldError("leaveEnd", validatePlayerField("leaveEnd", next));
                    }
                  }}
                />
              ) : null}
              {error ? <p className="muted wide">{error}</p> : null}
              <div className="wide">
                <Button type="submit" variant="primary" isDisabled={pending}>
                  {pending ? "Saving…" : editor === "create" ? "Create Player" : "Save"}
                </Button>
              </div>
            </Form>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function ReturnDateFields({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const selected = dateValue(value);
  return (
    <DatePicker
      className="wide"
      name="expectedReturnDate"
      granularity="day"
      value={selected}
      isInvalid={Boolean(error)}
      onChange={(next) => onChange(isoFromDate(next))}
    >
      <Label>Expected Return Date</Label>
      <DateField.Group>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <FieldError>{error}</FieldError>
      <DatePicker.Popover>
        <Calendar aria-label="Expected Return Date">
          <Calendar.Header>
            <Calendar.Heading />
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}

function LeaveDateFields({
  start,
  end,
  error,
  onChange,
}: {
  start: string;
  end: string;
  error?: string;
  onChange: (start: string, end: string) => void;
}) {
  const startValue = dateValue(start);
  const endValue = dateValue(end);
  const range = startValue && endValue ? { start: startValue, end: endValue } : null;
  return (
    <DateRangePicker
      className="wide"
      startName="leaveStart"
      endName="leaveEnd"
      granularity="day"
      value={range}
      isInvalid={Boolean(error)}
      onChange={(next) => onChange(isoFromDate(next?.start ?? null), isoFromDate(next?.end ?? null))}
    >
      <Label>Leave period</Label>
      <DateField.Group fullWidth>
        <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateRangePicker.RangeSeparator />
        <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DateRangePicker.Trigger>
            <DateRangePicker.TriggerIndicator />
          </DateRangePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <FieldError>{error}</FieldError>
      <DateRangePicker.Popover>
        <RangeCalendar aria-label="Leave period">
          <RangeCalendar.Header>
            <RangeCalendar.Heading />
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.NavButton slot="next" />
          </RangeCalendar.Header>
          <RangeCalendar.Grid>
            <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
            <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
          </RangeCalendar.Grid>
        </RangeCalendar>
      </DateRangePicker.Popover>
    </DateRangePicker>
  );
}
