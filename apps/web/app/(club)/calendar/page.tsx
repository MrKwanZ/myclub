"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { api } from "@/lib/api";
import { notifyDanger, notifyEventCreated, notifySaved } from "@/lib/notify";
import { useSession } from "@/lib/session";
import {
  eventPatchSchema,
  eventTypeLabel,
  eventTypes,
  eventWriteSchema,
  formatEventCardDate,
  formatLongDate,
  localISODate,
  type ClubEvent,
  type EventType,
} from "@myclub/shared";
import { Clock, Pencil, Plus } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Button,
  Calendar,
  Chip,
  DateField,
  DatePicker,
  Form,
  Input,
  Label,
  Modal,
  TextArea,
  TextField,
  TimeField,
} from "@heroui/react";
import {
  getLocalTimeZone,
  parseDate,
  parseTime,
  today,
  type CalendarDate,
  type DateValue,
  type Time,
} from "@internationalized/date";
import { useEffect, useMemo, useState } from "react";

const typeOptions = eventTypes.map((type) => ({ id: type, label: eventTypeLabel(type) }));

/**
 * The focused day can sit in either visible month, so load from the month before it to cover both grids
 * and enough of the future for "Next Activity".
 */
function loadWindow(focused: CalendarDate) {
  const start = focused.subtract({ months: 1 }).set({ day: 1 });
  const end = start.add({ months: 8 }).subtract({ days: 1 });
  return { from: start.toString(), to: end.toString() };
}

export default function CalendarPage() {
  const session = useSession();
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState<CalendarDate | null>(null);
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);

  useEffect(() => {
    const now = today(getLocalTimeZone());
    setFocused(now);
    setSelected(now.toString());
    setReady(true);
  }, []);

  const rangeKey = focused ? `${focused.year}-${focused.month}` : "";

  useEffect(() => {
    if (!ready || !focused || session.status !== "in" || !session.token || !session.clubId || session.role !== "manager") {
      return;
    }
    const token = session.token;
    const clubId = session.clubId;
    const { from, to } = loadWindow(focused);
    let cancelled = false;
    api
      .events(token, clubId, { from, to })
      .then((result) => {
        if (!cancelled) setEvents(result.events);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the calendar.");
      });
    return () => {
      cancelled = true;
    };
    // Refetch when the visible month changes, not when focus moves within the month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rangeKey, session.status, session.token, session.clubId, session.role]);

  async function reload() {
    if (!session.token || !session.clubId || !focused) return;
    const { from, to } = loadWindow(focused);
    const result = await api.events(session.token, session.clubId, { from, to });
    setEvents(result.events);
  }

  const byDate = useMemo(() => {
    const map = new Map<string, ClubEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);

  function goToNextActivity() {
    const upcoming = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const next = upcoming.find((event) => event.date > selected);
    if (!next) return;
    setSelected(next.date);
    setFocused(parseDate(next.date));
    setNotice(null);
    setError(null);
  }

  const dayEvents = (byDate.get(selected) ?? []).slice();

  if (!ready || !focused) {
    return <p className="muted">Loading…</p>;
  }

  const selectedDate = parseDate(selected);

  function renderCell(date: DateValue) {
    const hasEvents = (byDate.get(date.toString()) ?? []).length > 0;
    return (
      <Calendar.Cell date={date as CalendarDate} data-testid={`calendar-cell-${date.toString()}`}>
        {({ formattedDate }) => (
          <>
            {formattedDate}
            {hasEvents ? <Calendar.CellIndicator /> : null}
          </>
        )}
      </Calendar.Cell>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Incoming Events</h1>
        </div>
        <Button variant="primary" onPress={() => setEventOpen(true)}>
          <Icon data={Plus} size={16} />
          New Event
        </Button>
      </div>
      <Calendar
        aria-label="Club calendar"
        className="club-calendar"
        firstDayOfWeek="sun"
        focusedValue={focused}
        value={selectedDate}
        visibleDuration={{ months: 2 }}
        onChange={(value) => {
          if (value && !Array.isArray(value)) setSelected(value.toString());
        }}
        onFocusChange={(value) => {
          if (value) setFocused(parseDate(value.toString().slice(0, 10)));
        }}
      >
        <div className="calendar-months">
          <div className="calendar-month">
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => renderCell(date)}</Calendar.GridBody>
            </Calendar.Grid>
          </div>
          <div className="calendar-month">
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading offset={{ months: 1 }} />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid offset={{ months: 1 }}>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => renderCell(date)}</Calendar.GridBody>
            </Calendar.Grid>
          </div>
        </div>
        <Calendar.YearPickerGrid>
          <Calendar.YearPickerGridBody>{({ year }) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody>
        </Calendar.YearPickerGrid>
      </Calendar>
      <div className="calendar-actions">
        <Button variant="secondary" onPress={goToNextActivity}>
          Next Activity
        </Button>
      </div>
      <section className="stack">
        <h2>{formatLongDate(selected)}</h2>
        {dayEvents.length === 0 ? <p className="muted">Nothing on this day yet.</p> : null}
        {dayEvents.map((event) => (
          <DayEvent
            key={event.id}
            event={event}
            onSaved={async () => {
              setNotice("Saved.");
              notifySaved();
              await reload();
            }}
            onError={(message) => {
              setError(message);
              notifyDanger(message);
            }}
          />
        ))}
      </section>
      <Modal.Backdrop isOpen={eventOpen} onOpenChange={setEventOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add Event</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <CreateEvent
                date={selected}
                onCreated={async (iso) => {
                  setNotice("Added to the calendar.");
                  notifyEventCreated();
                  setError(null);
                  setSelected(iso);
                  setFocused(parseDate(iso));
                  setEventOpen(false);
                  await reload();
                }}
                onError={(message) => {
                  setError(message);
                  notifyDanger(message);
                }}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

function timeValue(value: string): Time | null {
  return /^\d{2}:\d{2}$/.test(value) ? parseTime(value) : null;
}

function CreateEvent({
  date,
  onCreated,
  onError,
}: {
  date: string;
  onCreated: (iso: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const session = useSession();
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("training");
  const [eventDate, setEventDate] = useState(date);
  const [startTime, setStartTime] = useState("19:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [opponent, setOpponent] = useState("");
  const [scoreFor, setScoreFor] = useState("");
  const [scoreAgainst, setScoreAgainst] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEventDate(date);
  }, [date]);

  useEffect(() => {
    if (eventDate > localISODate()) {
      setScoreFor("");
      setScoreAgainst("");
    }
  }, [eventDate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId) return;
    if (!name.trim()) {
      onError("Event name is required.");
      return;
    }
    if (!eventDate.trim()) {
      onError("Date is required.");
      return;
    }
    if (!startTime.trim()) {
      onError("Time is required.");
      return;
    }
    if (!location.trim()) {
      onError("Location is required.");
      return;
    }
    if (type === "match" && !opponent.trim()) {
      onError("Opponent is required.");
      return;
    }
    const scoresClosed = type === "match" && eventDate > localISODate();
    if (type === "match" && !scoresClosed && (scoreFor.trim() === "") !== (scoreAgainst.trim() === "")) {
      onError("Enter both scores.");
      return;
    }
    const parsed = eventWriteSchema.safeParse({
      name,
      type,
      date: eventDate,
      startTime: startTime.slice(0, 5),
      location,
      notes,
      opponent: type === "match" || type === "friendly" ? opponent : null,
      scoreFor: type === "match" && !scoresClosed && scoreFor.trim() !== "" ? Number(scoreFor) : null,
      scoreAgainst: type === "match" && !scoresClosed && scoreAgainst.trim() !== "" ? Number(scoreAgainst) : null,
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Check the session.");
      return;
    }
    setPending(true);
    try {
      await api.createEvent(session.token, session.clubId, parsed.data);
      setName("");
      setNotes("");
      setOpponent("");
      setScoreFor("");
      setScoreAgainst("");
      await onCreated(parsed.data.date);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not add the session.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Form className="form-grid" onSubmit={onSubmit}>
      <TextField className="wide" name="name" value={name} onChange={setName}>
        <Label>Event Name</Label>
        <Input />
      </TextField>
      <div className="field">
        <span>Type</span>
        <ChoiceMenu label="Type" value={type} options={typeOptions} onChange={(value) => setType(value as EventType)} />
      </div>
      <div className="field-pair wide">
        <DatePicker
          className="event-when"
          granularity="day"
          name="date"
          value={eventDate ? parseDate(eventDate) : null}
          onChange={(value) => setEventDate(value ? value.toString() : "")}
        >
          <Label>Date</Label>
          <DateField.Group fullWidth>
            <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            <DateField.Suffix>
              <DatePicker.Trigger>
                <DatePicker.TriggerIndicator />
              </DatePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <DatePicker.Popover>
            <Calendar aria-label="Event date">
              <Calendar.Header>
                <Calendar.YearPickerTrigger>
                  <Calendar.YearPickerTriggerHeading />
                  <Calendar.YearPickerTriggerIndicator />
                </Calendar.YearPickerTrigger>
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
              </Calendar.Grid>
              <Calendar.YearPickerGrid>
                <Calendar.YearPickerGridBody>
                  {({ year }) => <Calendar.YearPickerCell year={year} />}
                </Calendar.YearPickerGridBody>
              </Calendar.YearPickerGrid>
            </Calendar>
          </DatePicker.Popover>
        </DatePicker>
        <TimeField
          className="event-when"
          granularity="minute"
          hourCycle={24}
          name="startTime"
          value={timeValue(startTime)}
          onChange={(value) => setStartTime(value ? value.toString().slice(0, 5) : "")}
        >
          <Label>Time</Label>
          <TimeField.Group fullWidth>
            <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
            <TimeField.Suffix>
              <Icon data={Clock} size={16} />
            </TimeField.Suffix>
          </TimeField.Group>
        </TimeField>
      </div>
      <TextField className="wide" name="location" value={location} onChange={setLocation}>
        <Label>Location</Label>
        <Input />
      </TextField>
      {type === "match" || type === "friendly" ? (
        <TextField className="wide" name="opponent" value={opponent} onChange={setOpponent}>
          <Label>Opponent</Label>
          <Input />
        </TextField>
      ) : null}
      {type === "match" ? (
        <>
          <TextField
            name="scoreFor"
            type="number"
            value={scoreFor}
            isDisabled={eventDate > localISODate()}
            onChange={setScoreFor}
          >
            <Label>Our score</Label>
            <Input min={0} />
          </TextField>
          <TextField
            name="scoreAgainst"
            type="number"
            value={scoreAgainst}
            isDisabled={eventDate > localISODate()}
            onChange={setScoreAgainst}
          >
            <Label>Their score</Label>
            <Input min={0} />
          </TextField>
        </>
      ) : null}
      <TextField className="wide" name="notes" value={notes} onChange={setNotes}>
        <Label>Notes</Label>
        <TextArea />
      </TextField>
      <div className="wide">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "Adding…" : "Add Event"}
        </Button>
      </div>
    </Form>
  );
}

function DayEvent({
  event,
  onSaved,
  onError,
}: {
  event: ClubEvent;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(event.name);
  const [startTime, setStartTime] = useState(event.startTime);
  const [location, setLocation] = useState(event.location);
  const [notes, setNotes] = useState(event.notes);
  const [opponent, setOpponent] = useState(event.opponent ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setName(event.name);
    setStartTime(event.startTime);
    setLocation(event.location);
    setNotes(event.notes);
    setOpponent(event.opponent ?? "");
  }, [event]);

  async function onSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!session.token || !session.clubId) return;
    if (!name.trim()) {
      onError("Event name is required.");
      return;
    }
    if (!startTime.trim()) {
      onError("Time is required.");
      return;
    }
    if (!location.trim()) {
      onError("Location is required.");
      return;
    }
    if (event.type === "match" && !opponent.trim()) {
      onError("Opponent is required.");
      return;
    }
    const parsed = eventPatchSchema.safeParse({
      name,
      startTime: startTime.slice(0, 5),
      location,
      notes,
      ...(event.type === "match" || event.type === "friendly" ? { opponent } : {}),
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Check the session.");
      return;
    }
    setPending(true);
    try {
      await api.updateEvent(session.token, session.clubId, event.id, parsed.data);
      setOpen(false);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save the session.");
    } finally {
      setPending(false);
    }
  }

  const withOpponent = event.type === "match" || event.type === "friendly";

  return (
    <article className="card event-card">
      <header>
        <div className="event-card-title">
          <h3>{event.name || formatEventCardDate(event.date)}</h3>
          <span className="muted">{event.startTime}</span>
        </div>
        <Chip className={eventChipClass(event.type)} color={eventChipColor(event.type)} size="sm" variant="soft">
          {eventTypeLabel(event.type)}
        </Chip>
      </header>
      <div className="event-card-row">
        <div className="event-card-body">
          {withOpponent && event.opponent ? <p>{event.opponent}</p> : null}
          <p className="muted">{event.location || "No location"}</p>
          {event.result ? (
            <p className="muted">
              {event.scoreFor}–{event.scoreAgainst} {event.result}
            </p>
          ) : null}
        </div>
        <Button isIconOnly aria-label="Edit" variant="secondary" onPress={() => setOpen(true)}>
          <Icon data={Pencil} size={16} />
        </Button>
      </div>
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Edit Event</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form className="form-grid" onSubmit={onSubmit}>
                <TextField className="wide" name="name" value={name} onChange={setName}>
                  <Label>Event Name</Label>
                  <Input />
                </TextField>
                <TextField className="wide" name="startTime" type="time" value={startTime} onChange={setStartTime}>
                  <Label>Time</Label>
                  <Input />
                </TextField>
                <TextField className="wide" name="location" value={location} onChange={setLocation}>
                  <Label>Location</Label>
                  <Input />
                </TextField>
                {withOpponent ? (
                  <TextField className="wide" name="opponent" value={opponent} onChange={setOpponent}>
                    <Label>Opponent</Label>
                    <Input />
                  </TextField>
                ) : null}
                <TextField className="wide" name="notes" value={notes} onChange={setNotes}>
                  <Label>Notes</Label>
                  <TextArea />
                </TextField>
                <div className="wide">
                  <Button type="submit" variant="primary" isDisabled={pending}>
                    {pending ? "Saving…" : "Save Event"}
                  </Button>
                </div>
              </Form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </article>
  );
}

function eventChipColor(type: string) {
  switch (type) {
    case "match":
      return "accent" as const;
    case "friendly":
      return "success" as const;
    case "training":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function eventChipClass(type: string) {
  return type === "leisure" ? "chip-leisure" : undefined;
}
