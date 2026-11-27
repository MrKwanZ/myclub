"use client";

import { NotificationCentre } from "@/components/NotificationCentre";
import { api } from "@/lib/api";
import { validateIntInput } from "@/lib/fieldValidation";
import { notifyDanger, notifySaved } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { eventPatchSchema, formatEventWhen, localISODate, managesClub, type ClubEvent } from "@myclub/shared";
import { Button, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

type ScoreFieldErrors = {
  opponent?: string;
  scoreFor?: string;
  scoreAgainst?: string;
};

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
    if (session.status !== "in" || !managesClub(session.role)) return;
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
      <div className="page-heading">
        <div className="page-title">
          <h1>Matches</h1>
        </div>
        <NotificationCentre />
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
  const [fieldErrors, setFieldErrors] = useState<ScoreFieldErrors>({});
  const [pending, setPending] = useState(false);
  const scoresClosed = match.date > localISODate();

  function validateField(field: keyof ScoreFieldErrors, value: string): string | null {
    if (field === "opponent") {
      if (!value.trim()) return "Opponent is required.";
      if (value.trim().length > 120) return "Opponent is too long.";
      return null;
    }
    if (scoresClosed) return null;
    return validateIntInput(value, {
      required: true,
      requiredMessage: field === "scoreFor" ? "Our score is required." : "Their score is required.",
      min: 0,
      max: 99,
      rangeMessage: "Score must be from 0 to 99.",
      intMessage: "Score must be a whole number.",
    });
  }

  function updateFieldError(field: keyof ScoreFieldErrors, message: string | null) {
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
    if (!session.token || !session.clubId) return;
    const opponentError = validateField("opponent", opponent);
    const scoreForError = validateField("scoreFor", scoreFor);
    const scoreAgainstError = validateField("scoreAgainst", scoreAgainst);
    setFieldErrors({
      ...(opponentError ? { opponent: opponentError } : {}),
      ...(scoreForError ? { scoreFor: scoreForError } : {}),
      ...(scoreAgainstError ? { scoreAgainst: scoreAgainstError } : {}),
    });
    const firstError = opponentError ?? scoreForError ?? scoreAgainstError;
    if (firstError) {
      onError(firstError);
      return;
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
    <Form className="card form-grid" onSubmit={onSubmit}>
      <div className="wide">
        <strong>{formatEventWhen(match.date, match.startTime)}</strong>
        <p className="muted">{match.location}</p>
      </div>
      <TextField
        className="wide"
        name="opponent"
        isInvalid={Boolean(fieldErrors.opponent)}
        value={opponent}
        onChange={(value) => {
          setOpponent(value);
          if (fieldErrors.opponent) updateFieldError("opponent", validateField("opponent", value));
        }}
        onBlur={() => updateFieldError("opponent", validateField("opponent", opponent))}
      >
        <Label>Opponent</Label>
        <Input />
        <FieldError>{fieldErrors.opponent}</FieldError>
      </TextField>
      <TextField
        name="scoreFor"
        isDisabled={scoresClosed}
        isInvalid={Boolean(fieldErrors.scoreFor)}
        value={scoreFor}
        onChange={(value) => {
          setScoreFor(value);
          if (fieldErrors.scoreFor) updateFieldError("scoreFor", validateField("scoreFor", value));
        }}
        onBlur={() => updateFieldError("scoreFor", validateField("scoreFor", scoreFor))}
      >
        <Label>Our score</Label>
        <Input inputMode="numeric" />
        <FieldError>{fieldErrors.scoreFor}</FieldError>
      </TextField>
      <TextField
        name="scoreAgainst"
        isDisabled={scoresClosed}
        isInvalid={Boolean(fieldErrors.scoreAgainst)}
        value={scoreAgainst}
        onChange={(value) => {
          setScoreAgainst(value);
          if (fieldErrors.scoreAgainst) updateFieldError("scoreAgainst", validateField("scoreAgainst", value));
        }}
        onBlur={() => updateFieldError("scoreAgainst", validateField("scoreAgainst", scoreAgainst))}
      >
        <Label>Their score</Label>
        <Input inputMode="numeric" />
        <FieldError>{fieldErrors.scoreAgainst}</FieldError>
      </TextField>
      {scoresClosed ? <p className="muted wide">Scores stay closed until the match date.</p> : null}
      <div className="wide">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "Saving…" : "Save result"}
        </Button>
      </div>
    </Form>
  );
}
