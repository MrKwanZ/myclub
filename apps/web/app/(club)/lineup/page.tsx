"use client";

import { LineupPitch, downloadLineupAsImage } from "@/components/LineupPitch";
import { NotificationCentre } from "@/components/NotificationCentre";
import { api } from "@/lib/api";
import { notifyDanger, notifySaved } from "@/lib/notify";
import { useSession } from "@/lib/session";
import {
  canonicalPosition,
  eventTypeLabel,
  formatEventWhen,
  layoutLineupPlayers,
  localISODate,
  managesClub,
  normalizeLineupPosition,
  validateLineupAddition,
  type ClubEvent,
  type Player,
  type PositionedLineupPlayer,
} from "@myclub/shared";
import { ArrowRotateLeft, Calendar, FloppyDisk, Picture } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Button,
  Description,
  Dropdown,
  ErrorMessage,
  FieldError,
  Form,
  Label,
  Link,
  ListBox,
  ListLayout,
  Modal,
  Select,
  Spinner,
  Surface,
  Virtualizer,
  type Key,
  type Selection,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

const PLAYER_LIST_LAYOUT_OPTIONS = { rowHeight: 54 };

function sortRosterPlayers(a: Player, b: Player) {
  if (a.shirtNumber == null && b.shirtNumber != null) return 1;
  if (a.shirtNumber != null && b.shirtNumber == null) return -1;
  if (a.shirtNumber != null && b.shirtNumber != null && a.shirtNumber !== b.shirtNumber) {
    return a.shirtNumber - b.shirtNumber;
  }
  return a.name.localeCompare(b.name);
}

export default function LineupPage() {
  const session = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [jerseys, setJerseys] = useState<string[]>([]);
  const [selectedJersey, setSelectedJersey] = useState<string | null>(null);
  const [lineupPlayers, setLineupPlayers] = useState<PositionedLineupPlayer[]>([]);
  const [lineupError, setLineupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [incomingMatches, setIncomingMatches] = useState<ClubEvent[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<Key | null>(null);
  const [matchModalError, setMatchModalError] = useState<string | null>(null);
  const [savingMatchday, setSavingMatchday] = useState(false);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.clubId || !managesClub(session.role)) return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.players(token, clubId), api.club(token, clubId)])
      .then(([playersRes, clubRes]) => {
        if (cancelled) return;
        setPlayers([...playersRes.players].sort(sortRosterPlayers));
        setJerseys(clubRes.club.jerseys ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) notifyDanger(err instanceof Error ? err.message : "Could not load lineup data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  const selectedKeys = useMemo(
    () => new Set<string>(lineupPlayers.map((item) => item.playerId)),
    [lineupPlayers],
  );

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const player of players) map.set(player.id, player);
    return map;
  }, [players]);

  function onPlayerSelectionChange(nextSelection: Selection) {
    const requestedIds =
      nextSelection === "all"
        ? players.map((player) => player.id)
        : Array.from(nextSelection, (key) => String(key));
    const requestedSet = new Set(requestedIds);
    const currentSet = new Set(lineupPlayers.map((item) => item.playerId));

    const remaining = lineupPlayers.filter((item) => requestedSet.has(item.playerId));
    const addedIds = requestedIds.filter((id) => !currentSet.has(id));

    if (addedIds.length === 0) {
      setLineupError(null);
      setLineupPlayers(layoutLineupPlayers(remaining));
      return;
    }

    const working = [...remaining];
    let rejection: string | null = null;
    for (const id of addedIds) {
      const candidate = playerById.get(id);
      if (!candidate) continue;
      const err = validateLineupAddition(working, candidate);
      if (err) {
        rejection = err;
        break;
      }
      working.push({
        playerId: candidate.id,
        name: candidate.name,
        shirtNumber: candidate.shirtNumber,
        position: normalizeLineupPosition(candidate.position),
        x: 50,
        y: 50,
        dragged: false,
      });
    }

    setLineupError(rejection);
    setLineupPlayers(layoutLineupPlayers(working));
  }

  const handlePlayerMove = useCallback((playerId: string, x: number, y: number) => {
    setLineupPlayers((current) =>
      current.map((item) => (item.playerId === playerId ? { ...item, x, y, dragged: true } : item)),
    );
  }, []);

  function onClear() {
    setLineupPlayers([]);
    setLineupError(null);
  }

  async function openMatchdayModal() {
    if (!session.token || !session.clubId) return;
    setMatchModalError(null);
    setSelectedEventId(null);
    setMatchModalOpen(true);
    setLoadingMatches(true);
    try {
      const today = localISODate();
      const result = await api.events(session.token, session.clubId, { upcoming: "1" });
      const eligible = result.events.filter(
        (event) => (event.type === "match" || event.type === "friendly") && event.date >= today,
      );
      setIncomingMatches(eligible);
      if (eligible.length > 0) {
        setSelectedEventId(eligible[0].id);
      }
    } catch (err) {
      notifyDanger(err instanceof Error ? err.message : "Could not load incoming matches.");
    } finally {
      setLoadingMatches(false);
    }
  }

  async function onDownloadImage() {
    try {
      await downloadLineupAsImage({
        jerseyUrl: selectedJersey,
        players: lineupPlayers.map(({ playerId, name, shirtNumber, position, x, y }) => ({
          playerId,
          name,
          shirtNumber,
          position,
          x,
          y,
        })),
      });
    } catch (err) {
      notifyDanger(err instanceof Error ? err.message : "Could not download the lineup image.");
    }
  }

  async function onSaveMatchdayLineup(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!session.token || !session.clubId || savingMatchday) return;
    if (!selectedEventId) {
      setMatchModalError("Select an incoming match or friendly.");
      return;
    }
    if (lineupPlayers.length === 0) {
      setMatchModalError("Select at least one player on the lineup board first.");
      return;
    }
    setSavingMatchday(true);
    setMatchModalError(null);
    try {
      await api.saveEventLineup(session.token, session.clubId, String(selectedEventId), {
        jerseyUrl: selectedJersey,
        players: lineupPlayers.map(({ playerId, name, shirtNumber, position, x, y }) => ({
          playerId,
          name,
          shirtNumber,
          position,
          x,
          y,
        })),
      });
      setMatchModalOpen(false);
      notifySaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save matchday lineup.";
      setMatchModalError(message);
      notifyDanger(message);
    } finally {
      setSavingMatchday(false);
    }
  }

  if (!managesClub(session.role)) return null;

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Lineup</h1>
        </div>
        <NotificationCentre />
      </div>

      <div className="lineup-layout">
        <aside className="lineup-sidebar">
          <div className="lineup-section">
            <Label className="lineup-section-label">Player</Label>
            <Surface
              className={`lineup-surface${lineupError ? " lineup-surface-invalid" : ""}`}
              data-invalid={lineupError ? "true" : undefined}
              data-testid="lineup-player-surface"
              variant="default"
            >
              {loading ? (
                <div className="lineup-loading">
                  <Spinner size="sm" />
                  <span className="muted">Loading players…</span>
                </div>
              ) : (
                <Virtualizer layout={ListLayout} layoutOptions={PLAYER_LIST_LAYOUT_OPTIONS}>
                  <ListBox
                    aria-invalid={lineupError ? true : undefined}
                    aria-label="Player"
                    className={`lineup-listbox${lineupError ? " lineup-listbox-invalid" : ""}`}
                    data-invalid={lineupError ? "true" : undefined}
                    items={players}
                    renderEmptyState={() => <p className="muted lineup-empty">No players in the club yet.</p>}
                    selectedKeys={selectedKeys}
                    selectionMode="multiple"
                    onSelectionChange={onPlayerSelectionChange}
                  >
                    {(player) => (
                      <ListBox.Item aria-label={player.name} id={player.id} textValue={player.name}>
                        <div className="lineup-item-copy">
                          <Label>
                            {player.shirtNumber != null ? `#${player.shirtNumber} ` : ""}
                            {player.name}
                          </Label>
                          <Description>{canonicalPosition(player.position) || "Midfielder"}</Description>
                        </div>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    )}
                  </ListBox>
                </Virtualizer>
              )}
            </Surface>
            {lineupError ? <ErrorMessage className="lineup-error-msg">{lineupError}</ErrorMessage> : null}
          </div>

          <div className="lineup-section">
            <Label className="lineup-section-label">Jersey</Label>
            {jerseys.length === 0 ? (
              <p className="muted lineup-jersey-empty">
                No jerseys uploaded yet. Upload jerseys in <Link href="/account">Account</Link>.
              </p>
            ) : (
              <div aria-label="Jersey" className="lineup-jersey-grid" role="group">
                {jerseys.map((jerseyUrl, index) => {
                  const selected = selectedJersey === jerseyUrl;
                  return (
                    <Button
                      key={`${index}-${jerseyUrl.slice(-24)}`}
                      aria-label={`Jersey ${index + 1}`}
                      aria-pressed={selected}
                      className={`lineup-jersey-btn${selected ? " lineup-jersey-btn-selected" : ""}`}
                      data-selected={selected ? "true" : undefined}
                      variant="outline"
                      onPress={() => setSelectedJersey((prev) => (prev === jerseyUrl ? null : jerseyUrl))}
                    >
                      <img alt={`Jersey ${index + 1}`} className="lineup-jersey-thumb" src={jerseyUrl} />
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lineup-actions">
            <Dropdown>
              <Button variant="primary">
                <Icon data={FloppyDisk} size={16} />
                Save…
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label="Save lineup"
                  onAction={(key) => {
                    if (key === "matchday") void openMatchdayModal();
                    if (key === "image") void onDownloadImage();
                  }}
                >
                  <Dropdown.Item id="matchday" textValue="As matchday lineup">
                    <Icon data={Calendar} size={16} />
                    <Label>As matchday lineup</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="image" textValue="As image">
                    <Icon data={Picture} size={16} />
                    <Label>As image</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            <Button variant="outline" onPress={onClear}>
              <Icon data={ArrowRotateLeft} size={16} />
              Clear
            </Button>
          </div>
        </aside>

        <section aria-label="Lineup pitch" className="lineup-board-area">
          <LineupPitch
            interactive
            jerseyUrl={selectedJersey}
            players={lineupPlayers}
            onPlayerMove={handlePlayerMove}
          />
        </section>
      </div>

      <Modal.Backdrop
        isOpen={matchModalOpen}
        onOpenChange={(open) => {
          if (!savingMatchday) setMatchModalOpen(open);
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Save as matchday lineup</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {loadingMatches ? (
                <div className="lineup-loading">
                  <Spinner size="sm" />
                  <span className="muted">Loading incoming matches…</span>
                </div>
              ) : (
                <Form className="stack" onSubmit={onSaveMatchdayLineup}>
                  <Select
                    fullWidth
                    isDisabled={incomingMatches.length === 0}
                    isInvalid={Boolean(matchModalError)}
                    placeholder={
                      incomingMatches.length === 0
                        ? "No incoming matches or friendlies"
                        : "Select a match or friendly"
                    }
                    value={selectedEventId}
                    onChange={(key) => {
                      setSelectedEventId(key);
                      setMatchModalError(null);
                    }}
                  >
                    <Label>Incoming match or friendly</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {incomingMatches.map((ev) => {
                          const title = ev.name || ev.opponent || eventTypeLabel(ev.type);
                          const summary = `${formatEventWhen(ev.date, ev.startTime)} · ${title}`;
                          return (
                            <ListBox.Item key={ev.id} aria-label={summary} id={ev.id} textValue={summary}>
                              <div className="lineup-item-copy">
                                <Label>{title}</Label>
                                <Description>
                                  {eventTypeLabel(ev.type)} · {formatEventWhen(ev.date, ev.startTime)}
                                  {ev.opponent ? ` · ${ev.opponent}` : ""}
                                </Description>
                              </div>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          );
                        })}
                      </ListBox>
                    </Select.Popover>
                    {matchModalError ? <FieldError>{matchModalError}</FieldError> : null}
                  </Select>
                  {incomingMatches.length === 0 ? (
                    <p className="muted">Schedule an upcoming match or friendly on the Matches page first.</p>
                  ) : null}
                  {matchModalError && incomingMatches.length === 0 ? (
                    <ErrorMessage className="lineup-error-msg">{matchModalError}</ErrorMessage>
                  ) : null}
                  <div className="row">
                    <Button
                      isDisabled={savingMatchday || incomingMatches.length === 0}
                      type="submit"
                      variant="primary"
                    >
                      {savingMatchday ? "Saving…" : "Attach Lineup"}
                    </Button>
                    <Button
                      isDisabled={savingMatchday}
                      type="button"
                      variant="outline"
                      onPress={() => setMatchModalOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </Form>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
