"use client";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { attendanceLabel, eventSummary, eventTypeLabel, formatEventWhen, formatRepliedAt, type MyAttendanceRecord } from "@myclub/shared";
import { Chip, Table } from "@heroui/react";
import { useEffect, useState } from "react";

export default function MyAttendancePage() {
  const session = useSession();
  const [records, setRecords] = useState<MyAttendanceRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || session.role !== "player") return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .myAttendance(token, clubId)
      .then((result) => {
        if (!cancelled) {
          setRecords(result.records);
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded(true);
          setError(err instanceof Error ? err.message : "Could not load your attendance.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  return (
    <>
      <div className="page-title">
        <h1>My Attendance</h1>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="My attendance">
            <Table.Header>
              <Table.Column isRowHeader>Session</Table.Column>
              <Table.Column>Type</Table.Column>
              <Table.Column>Status</Table.Column>
              <Table.Column>Replied Date</Table.Column>
            </Table.Header>
            <Table.Body>
              {!loaded ? (
                <Table.Row>
                  <Table.Cell>Loading…</Table.Cell>
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                </Table.Row>
              ) : null}
              {loaded && records.length === 0 ? (
                <Table.Row>
                  <Table.Cell>No past sessions yet.</Table.Cell>
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                </Table.Row>
              ) : null}
              {records.map((record) => (
                <Table.Row key={record.eventId}>
                  <Table.Cell>
                    <strong>{formatEventWhen(record.date, record.startTime)}</strong>
                    <p className="muted">
                      {eventSummary(record)} · {record.location}
                    </p>
                  </Table.Cell>
                  <Table.Cell>
                    <Chip className={eventChipClass(record.type)} color={eventChipColor(record.type)} size="sm" variant="soft">
                      {eventTypeLabel(record.type)}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>{attendanceLabel(record.status)}</Table.Cell>
                  <Table.Cell>{formatRepliedAt(record.repliedAt)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </>
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
