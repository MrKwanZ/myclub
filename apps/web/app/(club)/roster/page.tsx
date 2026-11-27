"use client";

import { NotificationCentre } from "@/components/NotificationCentre";
import { PlayerFormModal } from "@/components/PlayerFormModal";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { usePagedRows } from "@/lib/usePagedRows";
import { canonicalPosition, managesClub, playerStatusLabel, type Player } from "@myclub/shared";
import { Plus } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Button, Chip, Link, Spinner, Table } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

function statusColor(status: string): "success" | "warning" | "danger" {
  if (status === "injured") return "warning";
  if (status === "left") return "danger";
  return "success";
}

function byShirt(a: Player, b: Player) {
  if (a.shirtNumber == null && b.shirtNumber != null) return 1;
  if (a.shirtNumber != null && b.shirtNumber == null) return -1;
  if (a.shirtNumber != null && b.shirtNumber != null && a.shirtNumber !== b.shirtNumber) {
    return a.shirtNumber - b.shirtNumber;
  }
  return a.name.localeCompare(b.name);
}

export default function RosterPage() {
  const session = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ordered = useMemo(() => [...players].sort(byShirt), [players]);
  const page = usePagedRows(ordered, 10);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId) return;
    const result = await api.players(session.token, session.clubId);
    setPlayers(result.players);
  }, [session.token, session.clubId]);

  useEffect(() => {
    if (session.status !== "in" || !managesClub(session.role)) return;
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the roster.");
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.role, load]);

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Roster</h1>
        </div>
        <div className="page-actions">
          <NotificationCentre />
          <Button variant="primary" onPress={() => setCreating(true)}>
            <Icon data={Plus} size={16} />
            Create Player
          </Button>
        </div>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      {page.loading && page.rows.length === 0 ? (
        <div className="card row">
          <Spinner />
          <span className="muted">Loading players…</span>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Roster">
              <Table.Header>
                <Table.Column isRowHeader>Player</Table.Column>
                <Table.Column>Position</Table.Column>
                <Table.Column>No.</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column>Attendance</Table.Column>
              </Table.Header>
              <Table.Body>
                {page.rows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>No players yet.</Table.Cell>
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                  </Table.Row>
                ) : (
                  page.rows.map((player) => (
                    <Table.Row key={player.id}>
                      <Table.Cell>
                        <Link href={`/roster/${player.id}`}>{player.name}</Link>
                      </Table.Cell>
                      <Table.Cell>{canonicalPosition(player.position) || "–"}</Table.Cell>
                      <Table.Cell>{player.shirtNumber ?? "–"}</Table.Cell>
                      <Table.Cell>
                        <Chip color={statusColor(player.status)} size="sm" variant="soft">
                          {playerStatusLabel(player.status)}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="row">
                          {(player.recentAttendance ?? []).length === 0 ? (
                            <span className="muted">–</span>
                          ) : (
                            player.recentAttendance?.map((mark, index) => (
                              <Chip
                                key={`${player.id}-${index}`}
                                aria-label={mark === "S" ? "Present" : "Absent"}
                                color={mark === "S" ? "success" : "danger"}
                                size="sm"
                                variant="primary"
                              >
                                {mark}
                              </Chip>
                            ))
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
                {page.hasMore ? (
                  <Table.LoadMore isLoading={page.loading} onLoadMore={page.loadMore}>
                    <Table.LoadMoreContent>
                      <Spinner size="sm" />
                    </Table.LoadMoreContent>
                  </Table.LoadMore>
                ) : null}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
      <PlayerFormModal
        editor={creating ? "create" : null}
        token={session.token}
        clubId={session.clubId}
        onClose={() => setCreating(false)}
        onSaved={load}
      />
    </>
  );
}
