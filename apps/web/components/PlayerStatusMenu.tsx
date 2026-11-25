"use client";

import { api } from "@/lib/api";
import { notifyDanger, notifySaved, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { playerStatusReportSchema } from "@myclub/shared";
import { DiamondExclamation, EllipsisVertical, Plane } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Button,
  Calendar,
  DateField,
  DatePicker,
  DateRangePicker,
  Dropdown,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  RangeCalendar,
  TextArea,
  TextField,
  Tooltip,
} from "@heroui/react";
import { parseDate, type CalendarDate, type DateValue } from "@internationalized/date";
import { useState } from "react";

type Mode = "injury" | "leave" | null;

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

export function PlayerStatusMenu() {
  const session = useSession();
  const [mode, setMode] = useState<Mode>(null);
  const [injuryArea, setInjuryArea] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function open(next: Exclude<Mode, null>) {
    setFieldErrors({});
    setMode(next);
  }

  function close() {
    if (pending) return;
    setMode(null);
    setFieldErrors({});
  }

  async function onInjury(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || pending) return;
    const parsed = playerStatusReportSchema.safeParse({
      kind: "injury",
      injuryArea,
      expectedReturnDate: expectedReturnDate || null,
      remarks,
    });
    if (!parsed.success || parsed.data.kind !== "injury" || !parsed.data.expectedReturnDate) {
      const next: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      if (!parsed.success) notifyZod(parsed.error, "Check the form and try again.");
      return;
    }
    setPending(true);
    try {
      await api.reportStatus(session.token, session.clubId, {
        kind: "injury",
        injuryArea: parsed.data.injuryArea,
        expectedReturnDate: parsed.data.expectedReturnDate,
        remarks: parsed.data.remarks,
      });
      setInjuryArea("");
      setExpectedReturnDate("");
      setRemarks("");
      setMode(null);
      notifySaved();
    } catch (err) {
      notifyDanger(err instanceof Error ? err.message : "Could not update the status.");
    } finally {
      setPending(false);
    }
  }

  async function onLeave(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || pending) return;
    const parsed = playerStatusReportSchema.safeParse({
      kind: "leave",
      leaveStart: leaveStart || null,
      leaveEnd: leaveEnd || null,
    });
    if (!parsed.success || parsed.data.kind !== "leave" || !parsed.data.leaveStart || !parsed.data.leaveEnd) {
      const next: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      if (!parsed.success) notifyZod(parsed.error, "Check the form and try again.");
      return;
    }
    setPending(true);
    try {
      await api.reportStatus(session.token, session.clubId, {
        kind: "leave",
        leaveStart: parsed.data.leaveStart,
        leaveEnd: parsed.data.leaveEnd,
      });
      setLeaveStart("");
      setLeaveEnd("");
      setMode(null);
      notifySaved();
    } catch (err) {
      notifyDanger(err instanceof Error ? err.message : "Could not update the status.");
    } finally {
      setPending(false);
    }
  }

  const returnDate = dateValue(expectedReturnDate);
  const rangeStart = dateValue(leaveStart);
  const rangeEnd = dateValue(leaveEnd);
  const leaveRange = rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : null;

  return (
    <>
      <div className="corner-action">
        <Dropdown>
          <Tooltip delay={300}>
            <Button isIconOnly aria-label="Update Status" data-testid="update-status" variant="secondary">
              <Icon data={EllipsisVertical} size={16} />
            </Button>
            <Tooltip.Content placement="top">Update Status</Tooltip.Content>
          </Tooltip>
          <Dropdown.Popover>
            <Dropdown.Menu
              aria-label="Update Status"
              onAction={(key) => {
                if (key === "injury" || key === "leave") open(key);
              }}
            >
              <Dropdown.Item id="injury" textValue="Injury Update">
                <Icon data={DiamondExclamation} size={16} />
                <Label>Injury Update</Label>
              </Dropdown.Item>
              <Dropdown.Item id="leave" textValue="Request on Leave">
                <Icon data={Plane} size={16} />
                <Label>Request on Leave</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      <Modal.Backdrop isOpen={mode === "injury"} onOpenChange={(open) => { if (!open) close(); }}>
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Injury Update</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form className="stack" onSubmit={onInjury}>
                <TextField
                  name="injuryArea"
                  isInvalid={Boolean(fieldErrors.injuryArea)}
                  value={injuryArea}
                  onChange={(value) => {
                    setInjuryArea(value);
                    if (fieldErrors.injuryArea && value.trim()) {
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.injuryArea;
                        return next;
                      });
                    }
                  }}
                >
                  <Label>Injured Area</Label>
                  <Input />
                  <FieldError>{fieldErrors.injuryArea}</FieldError>
                </TextField>
                <DatePicker
                  name="expectedReturnDate"
                  granularity="day"
                  value={returnDate}
                  isInvalid={Boolean(fieldErrors.expectedReturnDate)}
                  onChange={(next) => setExpectedReturnDate(isoFromDate(next))}
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
                  <FieldError>{fieldErrors.expectedReturnDate}</FieldError>
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
                <TextField name="remarks" value={remarks} onChange={setRemarks}>
                  <Label>Remarks</Label>
                  <TextArea />
                </TextField>
                <div className="row">
                  <Button type="submit" variant="primary" isDisabled={pending}>
                    {pending ? "Submitting…" : "Submit"}
                  </Button>
                  <Button type="button" variant="outline" isDisabled={pending} onPress={close}>
                    Cancel
                  </Button>
                </div>
              </Form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop isOpen={mode === "leave"} onOpenChange={(open) => { if (!open) close(); }}>
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Request on Leave</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form className="stack" onSubmit={onLeave}>
                <DateRangePicker
                  startName="leaveStart"
                  endName="leaveEnd"
                  granularity="day"
                  value={leaveRange}
                  isInvalid={Boolean(fieldErrors.leaveEnd || fieldErrors.leaveStart)}
                  onChange={(next) => {
                    setLeaveStart(isoFromDate(next?.start ?? null));
                    setLeaveEnd(isoFromDate(next?.end ?? null));
                  }}
                >
                  <Label>Leave Period</Label>
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
                  <FieldError>{fieldErrors.leaveEnd ?? fieldErrors.leaveStart}</FieldError>
                  <DateRangePicker.Popover>
                    <RangeCalendar aria-label="Leave Period">
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
                <div className="row">
                  <Button type="submit" variant="primary" isDisabled={pending}>
                    {pending ? "Submitting…" : "Submit"}
                  </Button>
                  <Button type="button" variant="outline" isDisabled={pending} onPress={close}>
                    Cancel
                  </Button>
                </div>
              </Form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
