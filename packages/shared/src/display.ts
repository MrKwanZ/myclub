import { formatLongDate } from "./dates";

/** Dashboard heading from the viewer's local time, for example "Good morning, Alex". */
export function dashboardGreeting(name: string, now = new Date()) {
  const hour = now.getHours();
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const who = name.trim();
  return who ? `Good ${period}, ${who}` : `Good ${period}`;
}

/** Score color on a finished match: green for a win, red for a loss, default for a draw. */
export function scoreResultClass(result: string | null | undefined) {
  if (result === "win") return "score-win";
  if (result === "loss") return "score-loss";
  return undefined;
}

export const incomingEventTitle = "Incoming Event";

/** Toast body for the next club event. Players who have not replied get a reminder on the end. */
export function incomingEventMessage(
  event: { name: string; date: string; startTime: string },
  remindReply = false,
) {
  const name = event.name.trim() || "the event";
  const when = `${formatLongDate(event.date)}, ${event.startTime}`;
  let message = `Incoming ${name} on ${when}.`;
  if (remindReply) message += " Please reply your availability";
  return message;
}

/** True when a linked player still owes an RSVP for the event. */
export function shouldRemindEventReply(
  role: string | null,
  playerLinked: boolean,
  status: string | null | undefined,
) {
  const unanswered = !status || status === "unanswered";
  return role === "player" && playerLinked && unanswered;
}
