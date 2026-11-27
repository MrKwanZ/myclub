"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { NotificationCentre } from "@/components/NotificationCentre";
import { api } from "@/lib/api";
import { validateWithSchema } from "@/lib/fieldValidation";
import { notifyDanger, notifyDeleted, notifySaved, notifyZod } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { usePagedRows } from "@/lib/usePagedRows";
import {
  adminClubPatchSchema,
  adminRoles,
  adminUserPatchSchema,
  compareClubName,
  formatDateTime,
  roleLabel,
  type AdminClubRow,
  type AdminUserRow,
} from "@myclub/shared";
import { EllipsisVertical, Pencil, TrashBin } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { parseAbsoluteToLocal } from "@internationalized/date";
import {
  Button,
  DateField,
  Dropdown,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  Table,
  Tabs,
  TextField,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const roleOptions = adminRoles.map((role) => ({ id: role, label: roleLabel(role) }));

type UserDraft = {
  userId: string;
  membershipId: string | null;
  name: string;
  email: string;
  role: string;
  clubId: string;
};

type ClubDraft = { id: string; name: string };

type DeleteTarget =
  | { kind: "user"; userId: string; name: string }
  | { kind: "club"; clubId: string; name: string };

function AdminDateTime({ iso }: { iso: string | null }) {
  const label = iso ? formatDateTime(iso) : "";
  if (!iso || !label) return <span className="muted">–</span>;
  return (
    <DateField
      isReadOnly
      aria-label={label}
      className="admin-datetime"
      granularity="minute"
      hourCycle={12}
      value={parseAbsoluteToLocal(iso)}
    >
      <DateField.Group>
        <DateField.Input>
          {(segment) =>
            segment.type === "year" ? (
              <span>{label}</span>
            ) : (
              <DateField.Segment className="admin-datetime-rest" segment={segment} />
            )
          }
        </DateField.Input>
      </DateField.Group>
    </DateField>
  );
}

function RowActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="row-actions">
      <Dropdown>
        <Button isIconOnly aria-label={`Actions for ${label}`} size="sm" variant="outline">
          <Icon data={EllipsisVertical} size={16} />
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label={`Actions for ${label}`}
            onAction={(key) => {
              if (key === "edit") onEdit();
              if (key === "delete") onDelete();
            }}
          >
            <Dropdown.Item id="edit" textValue="Edit">
              <Label>
                <span className="menu-item">
                  <Icon data={Pencil} size={16} />
                  Edit
                </span>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="delete" textValue="Delete" variant="danger">
              <Label>
                <span className="menu-item">
                  <Icon data={TrashBin} size={16} />
                  Delete
                </span>
              </Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

function messageFrom(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function AdminPage() {
  const session = useSession();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [clubs, setClubs] = useState<AdminClubRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [clubDraft, setClubDraft] = useState<ClubDraft | null>(null);
  const [userErrors, setUserErrors] = useState<{ name?: string; email?: string }>({});
  const [clubError, setClubError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [pending, setPending] = useState(false);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => compareClubName(a.clubName, b.clubName) || compareClubName(a.name, b.name)),
    [users],
  );
  const sortedClubs = useMemo(() => [...clubs].sort((a, b) => compareClubName(a.name, b.name)), [clubs]);
  const userPage = usePagedRows(sortedUsers, 10);
  const clubPage = usePagedRows(sortedClubs, 10);
  const userLock = useRef(false);
  const clubLock = useRef(false);

  useEffect(() => {
    if (!userPage.loading) userLock.current = false;
  }, [userPage.loading]);

  useEffect(() => {
    if (!clubPage.loading) clubLock.current = false;
  }, [clubPage.loading]);

  const load = useCallback(async () => {
    if (!session.token) return;
    const [userResult, clubResult] = await Promise.all([
      api.adminUsers(session.token),
      api.adminClubs(session.token),
    ]);
    setUsers(userResult.users);
    setClubs(clubResult.clubs);
  }, [session.token]);

  useEffect(() => {
    if (session.status !== "in" || !session.token || !session.isAdmin) return;
    let cancelled = false;
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(messageFrom(err, "Could not load the admin panel."));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.isAdmin, load]);

  function onTableScroll(
    event: React.UIEvent<HTMLDivElement>,
    pageState: { hasMore: boolean; loading: boolean; loadMore: () => void },
    lock: React.MutableRefObject<boolean>,
  ) {
    if (!pageState.hasMore || pageState.loading || lock.current) return;
    const el = event.currentTarget;
    if (el.scrollTop <= 8) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 40) return;
    lock.current = true;
    pageState.loadMore();
  }

  function openUser(row: AdminUserRow) {
    setFormError(null);
    setUserErrors({});
    setUserDraft({
      userId: row.userId,
      membershipId: row.membershipId,
      name: row.name,
      email: row.email,
      role: (adminRoles as readonly string[]).includes(row.role) ? row.role : "player",
      clubId: row.clubId || clubs[0]?.id || "",
    });
  }

  function openClub(row: AdminClubRow) {
    setFormError(null);
    setClubError(null);
    setClubDraft({ id: row.id, name: row.name });
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !userDraft) return;
    const nameError = validateWithSchema(adminUserPatchSchema.shape.name, userDraft.name);
    const emailError = validateWithSchema(adminUserPatchSchema.shape.email, userDraft.email);
    setUserErrors({
      ...(nameError ? { name: nameError } : {}),
      ...(emailError ? { email: emailError } : {}),
    });
    const parsed = adminUserPatchSchema.safeParse(userDraft);
    if (!parsed.success) {
      notifyZod(parsed.error, "Check the form and try again.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const result = await api.updateAdminUser(session.token, userDraft.userId, parsed.data);
      setUsers(result.users);
      if (userDraft.userId === session.user?.id) await session.refresh();
      setUserDraft(null);
      notifySaved();
    } catch (err) {
      const message = messageFrom(err, "Could not save the user.");
      setFormError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  async function saveClub(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !clubDraft) return;
    const nameError = validateWithSchema(adminClubPatchSchema.shape.name, clubDraft.name);
    setClubError(nameError);
    const parsed = adminClubPatchSchema.safeParse({ name: clubDraft.name });
    if (!parsed.success) {
      notifyZod(parsed.error, "Check the form and try again.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const result = await api.updateAdminClub(session.token, clubDraft.id, parsed.data);
      setClubs(result.clubs);
      if (clubDraft.id === session.clubId) await session.refresh();
      setClubDraft(null);
      notifySaved();
    } catch (err) {
      const message = messageFrom(err, "Could not save the club.");
      setFormError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  async function confirmDelete() {
    if (!session.token || !deleting) return;
    setPending(true);
    try {
      if (deleting.kind === "user") {
        await api.deleteAdminUser(session.token, deleting.userId);
        setUsers((current) => current.filter((row) => row.userId !== deleting.userId));
      } else {
        await api.deleteAdminClub(session.token, deleting.clubId);
        setClubs((current) => current.filter((row) => row.id !== deleting.clubId));
        setUsers((current) =>
          current.map((row) =>
            row.clubId === deleting.clubId ? { ...row, clubId: "", clubName: "", membershipId: null, role: "" } : row,
          ),
        );
        if (deleting.clubId === session.clubId) await session.refresh();
      }
      setDeleting(null);
      notifyDeleted();
    } catch (err) {
      notifyDanger(messageFrom(err, "Could not delete that record."));
    } finally {
      setPending(false);
    }
  }

  if (!session.isAdmin) return null;

  const clubOptions = clubs.map((club) => ({ id: club.id, label: club.name }));

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Admin Panel</h1>
        </div>
        <NotificationCentre />
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {!ready ? (
        <div className="card row">
          <Spinner />
          <span className="muted">Loading records…</span>
        </div>
      ) : (
        <Tabs defaultSelectedKey="users">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Admin panel">
              <Tabs.Tab id="users">
                User
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="clubs">
                Club
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="users">
            <div
              className="admin-scroll"
              data-testid="admin-user-scroll"
              onScroll={(event) => onTableScroll(event, userPage, userLock)}
            >
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Users">
                    <Table.Header>
                      <Table.Column isRowHeader>Name</Table.Column>
                      <Table.Column>Role</Table.Column>
                      <Table.Column>Email</Table.Column>
                      <Table.Column>Club</Table.Column>
                      <Table.Column>Created Date</Table.Column>
                      <Table.Column>Last Login</Table.Column>
                      <Table.Column>
                        <span className="row-actions">Actions</span>
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {userPage.rows.length === 0 ? (
                        <Table.Row>
                          <Table.Cell>No users yet.</Table.Cell>
                          <Table.Cell />
                          <Table.Cell />
                          <Table.Cell />
                          <Table.Cell />
                          <Table.Cell />
                          <Table.Cell />
                        </Table.Row>
                      ) : (
                        userPage.rows.map((row) => (
                          <Table.Row key={row.id}>
                            <Table.Cell>{row.name}</Table.Cell>
                            <Table.Cell>{row.role ? roleLabel(row.role) : "–"}</Table.Cell>
                            <Table.Cell>{row.email}</Table.Cell>
                            <Table.Cell>{row.clubName || "–"}</Table.Cell>
                            <Table.Cell>
                              <AdminDateTime iso={row.createdAt} />
                            </Table.Cell>
                            <Table.Cell>
                              <AdminDateTime iso={row.lastLoginAt} />
                            </Table.Cell>
                            <Table.Cell>
                              <RowActions
                                label={row.name}
                                onEdit={() => openUser(row)}
                                onDelete={() => setDeleting({ kind: "user", userId: row.userId, name: row.name })}
                              />
                            </Table.Cell>
                          </Table.Row>
                        ))
                      )}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
              {userPage.loading && userPage.rows.length > 0 ? (
                <div className="row">
                  <Spinner size="sm" />
                </div>
              ) : null}
            </div>
          </Tabs.Panel>
          <Tabs.Panel id="clubs">
            <div
              className="admin-scroll"
              data-testid="admin-club-scroll"
              onScroll={(event) => onTableScroll(event, clubPage, clubLock)}
            >
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Clubs">
                    <Table.Header>
                      <Table.Column isRowHeader>Club name</Table.Column>
                      <Table.Column>Created Date</Table.Column>
                      <Table.Column>
                        <span className="row-actions">Actions</span>
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {clubPage.rows.length === 0 ? (
                        <Table.Row>
                          <Table.Cell>No clubs yet.</Table.Cell>
                          <Table.Cell />
                          <Table.Cell />
                        </Table.Row>
                      ) : (
                        clubPage.rows.map((row) => (
                          <Table.Row key={row.id}>
                            <Table.Cell>{row.name}</Table.Cell>
                            <Table.Cell>
                              <AdminDateTime iso={row.createdAt} />
                            </Table.Cell>
                            <Table.Cell>
                              <RowActions
                                label={row.name}
                                onEdit={() => openClub(row)}
                                onDelete={() => setDeleting({ kind: "club", clubId: row.id, name: row.name })}
                              />
                            </Table.Cell>
                          </Table.Row>
                        ))
                      )}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
              {clubPage.loading && clubPage.rows.length > 0 ? (
                <div className="row">
                  <Spinner size="sm" />
                </div>
              ) : null}
            </div>
          </Tabs.Panel>
        </Tabs>
      )}

      <Modal.Backdrop isOpen={userDraft !== null} onOpenChange={(open) => { if (!open) setUserDraft(null); }}>
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Edit user</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {userDraft ? (
                <Form className="form-grid" onSubmit={(event) => void saveUser(event)}>
                  <TextField
                    name="name"
                    isInvalid={Boolean(userErrors.name)}
                    value={userDraft.name}
                    onChange={(value) => setUserDraft({ ...userDraft, name: value })}
                  >
                    <Label>Name</Label>
                    <Input />
                    <FieldError>{userErrors.name}</FieldError>
                  </TextField>
                  <TextField
                    name="email"
                    type="email"
                    isInvalid={Boolean(userErrors.email)}
                    value={userDraft.email}
                    onChange={(value) => setUserDraft({ ...userDraft, email: value })}
                  >
                    <Label>Email</Label>
                    <Input />
                    <FieldError>{userErrors.email}</FieldError>
                  </TextField>
                  <div className="field">
                    <span>Role</span>
                    <ChoiceMenu
                      label="Role"
                      value={userDraft.role}
                      options={roleOptions}
                      onChange={(role) => setUserDraft({ ...userDraft, role })}
                    />
                  </div>
                  <div className="field">
                    <span>Club</span>
                    <ChoiceMenu
                      label="Club"
                      value={userDraft.clubId}
                      options={clubOptions}
                      onChange={(clubId) => setUserDraft({ ...userDraft, clubId })}
                    />
                  </div>
                  {formError ? <p className="muted wide">{formError}</p> : null}
                  <div className="wide">
                    <Button type="submit" variant="primary" isDisabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </Form>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop isOpen={clubDraft !== null} onOpenChange={(open) => { if (!open) setClubDraft(null); }}>
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Edit club</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {clubDraft ? (
                <Form className="form-grid" onSubmit={(event) => void saveClub(event)}>
                  <TextField
                    name="name"
                    isInvalid={Boolean(clubError)}
                    value={clubDraft.name}
                    onChange={(value) => setClubDraft({ ...clubDraft, name: value })}
                  >
                    <Label>Club name</Label>
                    <Input />
                    <FieldError>{clubError}</FieldError>
                  </TextField>
                  {formError ? <p className="muted wide">{formError}</p> : null}
                  <div className="wide">
                    <Button type="submit" variant="primary" isDisabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </Form>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop isOpen={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{deleting?.kind === "club" ? "Delete club" : "Delete user"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>Delete {deleting?.name}? This cannot be undone.</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" slot="close">
                Cancel
              </Button>
              <Button variant="danger" isDisabled={pending} onPress={() => void confirmDelete()}>
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
