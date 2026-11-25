"use client";

import { PlayerFormModal } from "@/components/PlayerFormModal";
import { api } from "@/lib/api";
import { validateWithSchema } from "@/lib/fieldValidation";
import { notifyDanger, notifyDeleted, notifySaved, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { canonicalPosition, playerAccountSchema, playerStatusLabel, type PlayerDetail } from "@myclub/shared";
import { EllipsisVertical, Pencil, TrashBin } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Button,
  Card,
  Chip,
  Dropdown,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  Modal,
  Spinner,
  TextField,
} from "@heroui/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type AccountFieldErrors = Partial<Record<"email" | "password", string>>;

function statusColor(status: string): "success" | "warning" | "danger" {
  if (status === "injured") return "warning";
  if (status === "left") return "danger";
  return "success";
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="player-info-item">
      <span className="eyebrow">{label}</span>
      <div className="player-info-value">{value}</div>
    </div>
  );
}

export default function PlayerDetailPage() {
  const session = useSession();
  const router = useRouter();
  const params = useParams<{ playerId: string }>();
  const playerId = params.playerId;

  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountErrors, setAccountErrors] = useState<AccountFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId || !playerId) return;
    setLoading(true);
    try {
      const result = await api.player(session.token, session.clubId, playerId);
      setPlayer(result.player);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the player.");
    } finally {
      setLoading(false);
    }
  }, [session.token, session.clubId, playerId]);

  useEffect(() => {
    if (session.status !== "in" || session.role !== "manager") return;
    void load();
  }, [session.status, session.role, load]);

  async function onDelete() {
    if (!session.token || !session.clubId || !player) return;
    setPending(true);
    setError(null);
    try {
      await api.deletePlayer(session.token, session.clubId, player.id);
      notifyDeleted();
      router.push("/roster");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete the player.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  function updateAccountError(field: "email" | "password", message: string | null) {
    setAccountErrors((current) => {
      if (!message) {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      }
      return { ...current, [field]: message };
    });
  }

  function validateAccountField(field: "email" | "password", value: string): string | null {
    if (field === "email") return validateWithSchema(playerAccountSchema.shape.email, value);
    return validateWithSchema(playerAccountSchema.shape.password, value);
  }

  async function onAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || !player) return;
    const emailError = validateAccountField("email", accountEmail);
    const passwordError = validateAccountField("password", accountPassword);
    setAccountErrors({
      ...(emailError ? { email: emailError } : {}),
      ...(passwordError ? { password: passwordError } : {}),
    });
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
      setShowAccountForm(false);
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

  const position = player ? canonicalPosition(player.position) : "";
  const isGoalkeeper = position === "Goalkeeper";

  return (
    <>
      <div className="page-heading">
        <Link href="/roster">Back to Roster</Link>
        {player ? (
          <Dropdown>
            <Button isIconOnly aria-label="Player actions" variant="secondary">
              <Icon data={EllipsisVertical} size={16} />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Player actions"
                onAction={(key) => {
                  if (key === "edit") setEditing(true);
                  if (key === "delete") setDeleting(true);
                }}
              >
                <Dropdown.Item id="edit" textValue="Edit">
                  <Icon data={Pencil} size={16} />
                  <Label>Edit</Label>
                </Dropdown.Item>
                <Dropdown.Item id="delete" textValue="Delete" variant="danger">
                  <Icon data={TrashBin} size={16} />
                  <Label>Delete</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        ) : null}
      </div>

      {error ? <p className="banner">{error}</p> : null}

      {loading && !player ? (
        <div className="card row">
          <Spinner />
          <span className="muted">Loading player…</span>
        </div>
      ) : player ? (
        <Card>
          <Card.Header>
            <div className="player-header-row">
              <h1>{player.name}</h1>
              <Chip color={statusColor(player.status)} size="sm" variant="soft">
                {playerStatusLabel(player.status)}
              </Chip>
            </div>
            <h2 className="muted">{position || "No position"}</h2>
          </Card.Header>
          <Card.Content>
            <div className="player-info-grid">
              <InfoItem label="Shirt number" value={player.shirtNumber ?? "–"} />
              <InfoItem label="Goals" value={player.goals} />
              <InfoItem label="Assists" value={player.assists} />
              <InfoItem label="Yellow cards" value={player.yellowCards} />
              <InfoItem label="Red cards" value={player.redCards} />
              <InfoItem label="Played minutes" value={player.playedMinutes} />
              <InfoItem label="Attendance" value={`${player.attendanceRate}%`} />
              <InfoItem
                label="Login"
                value={
                  <div className="row">
                    <span>{player.accountEmail ?? "No login"}</span>
                    {player.accountEmail ? null : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => {
                          setShowAccountForm((prev) => !prev);
                          setAccountEmail("");
                          setAccountPassword("");
                          setAccountErrors({});
                        }}
                      >
                        Create login
                      </Button>
                    )}
                  </div>
                }
              />
              {isGoalkeeper ? (
                <>
                  <InfoItem label="Saves" value={player.saves} />
                  <InfoItem label="Save percentage" value={`${player.savePercentage}%`} />
                </>
              ) : null}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {showAccountForm && player ? (
        <Form className="card form-grid" onSubmit={onAccount}>
          <TextField
            name="email"
            type="email"
            isInvalid={Boolean(accountErrors.email)}
            value={accountEmail}
            onChange={(value) => {
              setAccountEmail(value);
              if (accountErrors.email) updateAccountError("email", validateAccountField("email", value));
            }}
            onBlur={() => updateAccountError("email", validateAccountField("email", accountEmail))}
          >
            <Label>Login email</Label>
            <Input />
            <FieldError>{accountErrors.email}</FieldError>
          </TextField>
          <TextField
            name="password"
            type="password"
            isInvalid={Boolean(accountErrors.password)}
            value={accountPassword}
            onChange={(value) => {
              setAccountPassword(value);
              if (accountErrors.password) updateAccountError("password", validateAccountField("password", value));
            }}
            onBlur={() => updateAccountError("password", validateAccountField("password", accountPassword))}
          >
            <Label>Password</Label>
            <Input />
            <FieldError>{accountErrors.password}</FieldError>
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

      <PlayerFormModal
        editor={editing && player ? player : null}
        token={session.token}
        clubId={session.clubId}
        onClose={() => setEditing(false)}
        onSaved={load}
      />

      <Modal.Backdrop isOpen={deleting} onOpenChange={(open) => { if (!open) setDeleting(false); }}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Delete player</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>Delete {player?.name}? This cannot be undone.</p>
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
