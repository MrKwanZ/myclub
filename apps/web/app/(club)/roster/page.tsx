"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { api } from "@/lib/api";
import { notifyDanger, notifyDeleted, notifyPlayerAdded, notifySaved, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { usePagedRows } from "@/lib/usePagedRows";
import {
  canonicalPosition,
  playerAccountSchema,
  playerPositions,
  playerStatusLabel,
  playerStatuses,
  playerWriteSchema,
  type Player,
} from "@myclub/shared";
import { Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Button, Chip, Form, Input, Label, Modal, Spinner, Table, TextField } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PlayerForm = {
  name: string;
  position: string;
  shirtNumber: string;
  contact: string;
  status: string;
  goals: string;
  assists: string;
  injuryArea: string;
  expectedReturnDate: string;
};

const emptyForm: PlayerForm = {
  name: "",
  position: "",
  shirtNumber: "",
  contact: "",
  status: "active",
  goals: "",
  assists: "",
  injuryArea: "",
  expectedReturnDate: "",
};

const statusOptions = playerStatuses.map((status) => ({ id: status, label: playerStatusLabel(status) }));
const positionOptions = playerPositions.map((position) => ({ id: position, label: position }));

function statusColor(status: string): "success" | "warning" | "danger" {
  if (status === "injured") return "warning";
  if (status === "left") return "danger";
  return "success";
}

function formFromPlayer(player: Player): PlayerForm {
  return {
    name: player.name,
    position: canonicalPosition(player.position),
    shirtNumber: player.shirtNumber == null ? "" : String(player.shirtNumber),
    contact: player.contact,
    status: player.status,
    goals: String(player.goals),
    assists: String(player.assists),
    injuryArea: player.injuryArea,
    expectedReturnDate: player.expectedReturnDate ?? "",
  };
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
  const [form, setForm] = useState(emptyForm);
  const [editor, setEditor] = useState<"create" | Player | null>(null);
  const [deleting, setDeleting] = useState<Player | null>(null);
  const [accountFor, setAccountFor] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ordered = useMemo(() => [...players].sort(byShirt), [players]);
  const page = usePagedRows(ordered, 10);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId) return;
    const result = await api.players(session.token, session.clubId);
    setPlayers(result.players);
  }, [session.token, session.clubId]);

  useEffect(() => {
    if (session.status !== "in" || session.role !== "manager") return;
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the roster.");
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.role, load]);

  function openCreate() {
    setForm(emptyForm);
    setEditor("create");
    setError(null);
  }

  function openEdit(player: Player) {
    setForm(formFromPlayer(player));
    setEditor(player);
    setError(null);
  }

  function parsePlayer(input: PlayerForm) {
    const shirt = input.shirtNumber.trim();
    const injured = input.status === "injured";
    return playerWriteSchema.safeParse({
      name: input.name,
      position: input.position,
      contact: input.contact,
      status: input.status,
      shirtNumber: shirt === "" ? null : Number(shirt),
      goals: input.goals.trim() === "" ? 0 : Number(input.goals),
      assists: input.assists.trim() === "" ? 0 : Number(input.assists),
      injuryArea: injured ? input.injuryArea : "",
      expectedReturnDate: injured && input.expectedReturnDate ? input.expectedReturnDate : null,
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || !editor) return;
    const parsed = parsePlayer(form);
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
        await api.createPlayer(session.token, session.clubId, parsed.data);
        notifyPlayerAdded();
      } else {
        await api.updatePlayer(session.token, session.clubId, editor.id, parsed.data);
        notifySaved();
      }
      setEditor(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the player.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!session.token || !session.clubId || !deleting) return;
    setPending(true);
    setError(null);
    try {
      await api.deletePlayer(session.token, session.clubId, deleting.id);
      setDeleting(null);
      notifyDeleted();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete the player.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  async function onAccount(player: Player) {
    if (!session.token || !session.clubId) return;
    const parsed = playerAccountSchema.safeParse({ email: accountEmail, password: accountPassword });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the login.";
      setError(message);
      notifyZod(parsed.error, message);
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const result = await api.createPlayerAccount(session.token, session.clubId, player.id, {
        email: parsed.data.email,
        password: parsed.data.password || undefined,
      });
      setAccountFor(null);
      setAccountEmail("");
      setAccountPassword("");
      setNotice(result.linkedExisting ? "Linked the existing account." : "Player login created.");
      notifySaved();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the login.";
      setError(message);
      notifyDanger(message);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Roster</h1>
        </div>
        <Button variant="primary" onPress={openCreate}>
          <Icon data={Plus} size={16} />
          Create Player
        </Button>
      </div>
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
                <Table.Column>Contact</Table.Column>
                <Table.Column>Goals</Table.Column>
                <Table.Column>Assists</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column>Login</Table.Column>
                <Table.Column>
                  <span className="row-actions">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {page.rows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>No players yet.</Table.Cell>
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                  </Table.Row>
                ) : (
                  page.rows.map((player) => (
                    <Table.Row key={player.id}>
                      <Table.Cell>{player.name}</Table.Cell>
                      <Table.Cell>{canonicalPosition(player.position) || "–"}</Table.Cell>
                      <Table.Cell>{player.shirtNumber ?? "–"}</Table.Cell>
                      <Table.Cell>{player.contact || "–"}</Table.Cell>
                      <Table.Cell>{player.goals}</Table.Cell>
                      <Table.Cell>{player.assists}</Table.Cell>
                      <Table.Cell>
                        <Chip color={statusColor(player.status)} size="sm" variant="soft">
                          {playerStatusLabel(player.status)}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="row">
                          <span className="muted">{player.accountEmail ?? "No login"}</span>
                          {player.accountEmail ? null : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => {
                                setAccountFor(player.id);
                                setAccountEmail(player.accountEmail ?? "");
                                setAccountPassword("");
                              }}
                            >
                              Create login
                            </Button>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="row-actions">
                          <Button isIconOnly aria-label={`Edit ${player.name}`} size="sm" variant="secondary" onPress={() => openEdit(player)}>
                            <Icon data={Pencil} size={16} />
                          </Button>
                          <Button
                            isIconOnly
                            aria-label={`Delete ${player.name}`}
                            size="sm"
                            variant="danger-soft"
                            onPress={() => setDeleting(player)}
                          >
                            <Icon data={TrashBin} size={16} />
                          </Button>
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
      {accountFor ? (
        <Form
          className="card form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const player = players.find((item) => item.id === accountFor);
            if (player) void onAccount(player);
          }}
        >
          <TextField name="email" type="email" value={accountEmail} onChange={setAccountEmail}>
            <Label>Login email</Label>
            <Input />
          </TextField>
          <TextField name="password" type="password" value={accountPassword} onChange={setAccountPassword}>
            <Label>Password</Label>
            <Input />
          </TextField>
          <p className="muted wide">
            Leave the password blank to link an email that already has a MyClub login. The same person can be a player
            here and a manager of another club.
          </p>
          <div className="wide">
            <Button type="submit" variant="primary">
              Save login
            </Button>
          </div>
        </Form>
      ) : null}
      {notice ? <p className="muted">{notice}</p> : null}
      <Modal.Backdrop isOpen={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editor === "create" ? "Create Player" : "Edit Player"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form className="form-grid" onSubmit={onSubmit}>
                <PlayerFields form={form} onChange={setForm} />
                {error && editor ? <p className="muted wide">{error}</p> : null}
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
      <Modal.Backdrop isOpen={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Delete player</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>Delete {deleting?.name}? This cannot be undone.</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" slot="close">
                Cancel
              </Button>
              <Button variant="danger" isDisabled={pending} onPress={() => void onDelete()}>
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

function PlayerFields({ form, onChange }: { form: PlayerForm; onChange: (next: PlayerForm) => void }) {
  const injured = form.status === "injured";
  return (
    <>
      <TextField name="name" value={form.name} onChange={(value) => onChange({ ...form, name: value })}>
        <Label>Name</Label>
        <Input />
      </TextField>
      <div className="field">
        <span>Position</span>
        <ChoiceMenu
          label="Position"
          value={form.position}
          options={positionOptions}
          onChange={(position) => onChange({ ...form, position })}
        />
      </div>
      <TextField
        name="shirtNumber"
        type="number"
        value={form.shirtNumber}
        onChange={(value) => onChange({ ...form, shirtNumber: value })}
      >
        <Label>Shirt number</Label>
        <Input min={0} max={99} />
      </TextField>
      <TextField
        name="contact"
        type="text"
        value={form.contact}
        onChange={(value) => onChange({ ...form, contact: value.replace(/[^0-9-]/g, "") })}
      >
        <Label>Contact</Label>
        <Input inputMode="tel" />
      </TextField>
      <TextField name="goals" type="number" value={form.goals} onChange={(value) => onChange({ ...form, goals: value })}>
        <Label>Goals</Label>
        <Input min={0} />
      </TextField>
      <TextField name="assists" type="number" value={form.assists} onChange={(value) => onChange({ ...form, assists: value })}>
        <Label>Assists</Label>
        <Input min={0} />
      </TextField>
      <div className="field">
        <span>Status</span>
        <ChoiceMenu
          label="Status"
          value={form.status}
          options={statusOptions}
          onChange={(status) =>
            onChange({
              ...form,
              status,
              ...(status === "injured" ? {} : { injuryArea: "", expectedReturnDate: "" }),
            })
          }
        />
      </div>
      {injured ? (
        <>
          <TextField name="injuryArea" value={form.injuryArea} onChange={(value) => onChange({ ...form, injuryArea: value })}>
            <Label>Injury Area</Label>
            <Input />
          </TextField>
          <TextField
            name="expectedReturnDate"
            type="date"
            value={form.expectedReturnDate}
            onChange={(value) => onChange({ ...form, expectedReturnDate: value })}
          >
            <Label>Expected Return Date</Label>
            <Input />
          </TextField>
        </>
      ) : null}
    </>
  );
}
