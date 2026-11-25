"use client";

import { Field } from "@/components/Field";
import { api } from "@/lib/api";
import { notifyDanger, notifySaved } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { eventPatchSchema, formatEventWhen, localISODate, type ClubEvent } from "@myclub/shared";
import { useCallback, useEffect, useState } from "react";

export default function MatchesPage() {
  const session = useSession();
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId) return;
    const result = await api.events(session.token, session.clubId, { type: "match" });
    setEvents(result.events);
  }, [session.token, session.clubId]);

  useEffect(() => {
    if (session.status !== "in" || session.role !== "manager") return;
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load matches.");
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.role, load]);

  const open = events
    .filter((event) => !event.result)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const history = events.filter((event) => event.result);

  return (
    <>
      <div className="page-title">
        <h1>Matches</h1>
      </div>
      <section className="stack">
        <h2>Still to play</h2>
        {open.length === 0 ? <p className="muted">No matches are waiting for a score.</p> : null}
        {open.map((match) => (
          <ScoreForm
            key={match.id}
            match={match}
            onSaved={async () => {
              setNotice("Result saved.");
              setError(null);
              notifySaved();
              await load();
            }}
            onError={(message) => {
              setError(message);
              notifyDanger(message);
            }}
          />
        ))}
      </section>
      <section className="card table-wrap">
        <h2>History</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Opponent</th>
              <th>Score</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No finished matches yet.
                </td>
              </tr>
            ) : null}
            {history.map((match) => (
              <tr key={match.id}>
                <td>{formatEventWhen(match.date, match.startTime)}</td>
                <td>{match.opponent}</td>
                <td>
                  {match.scoreFor}–{match.scoreAgainst}
                </td>
                <td>
                  <span className={`pill ${match.result}`}>{match.result}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function ScoreForm({
  match,
  onSaved,
  onError,
}: {
  match: ClubEvent;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const session = useSession();
  const [opponent, setOpponent] = useState(match.opponent ?? "");
  const [scoreFor, setScoreFor] = useState("");
  const [scoreAgainst, setScoreAgainst] = useState("");
  const [pending, setPending] = useState(false);
  const scoresClosed = match.date > localISODate();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId) return;
    if (!opponent.trim()) {
      onError("Opponent is required.");
      return;
    }
    if (!scoresClosed) {
      if (scoreFor.trim() === "") {
        onError("Our score is required.");
        return;
      }
      if (scoreAgainst.trim() === "") {
        onError("Their score is required.");
        return;
      }
    }
    const parsed = eventPatchSchema.safeParse({
      opponent,
      ...(scoresClosed
        ? {}
        : {
            scoreFor: Number(scoreFor),
            scoreAgainst: Number(scoreAgainst),
          }),
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Check the score.");
      return;
    }
    setPending(true);
    try {
      await api.updateEvent(session.token, session.clubId, match.id, parsed.data);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save the result.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={onSubmit}>
      <div className="wide">
        <strong>{formatEventWhen(match.date, match.startTime)}</strong>
        <p className="muted">{match.location}</p>
      </div>
      <Field label="Opponent" wide>
        <input value={opponent} onChange={(event) => setOpponent(event.target.value)} />
      </Field>
      <Field label="Our score">
        <input
          inputMode="numeric"
          value={scoreFor}
          disabled={scoresClosed}
          onChange={(event) => setScoreFor(event.target.value)}
        />
      </Field>
      <Field label="Their score">
        <input
          inputMode="numeric"
          value={scoreAgainst}
          disabled={scoresClosed}
          onChange={(event) => setScoreAgainst(event.target.value)}
        />
      </Field>
      {scoresClosed ? <p className="muted wide">Scores stay closed until the match date.</p> : null}
      <div className="wide">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save result"}
        </button>
      </div>
    </form>
  );
}
