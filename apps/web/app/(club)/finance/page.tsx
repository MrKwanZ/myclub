"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { NotificationCentre } from "@/components/NotificationCentre";
import { api } from "@/lib/api";
import { validateDateInput, validateMoneyInput, validateWithSchema } from "@/lib/fieldValidation";
import {
  notifyDanger,
  notifyDeleted,
  notifyRequired,
  notifySaved,
  notifyTransactionAdded,
  notifyZod,
} from "@/lib/notify";
import { useSession } from "@/lib/session";
import { usePagedRows } from "@/lib/usePagedRows";
import {
  localISODate,
  transactionTypes,
  transactionWriteSchema,
  type Transaction,
} from "@myclub/shared";
import { EllipsisVertical, Pencil, Plus, TrashBin } from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import {
  Button,
  Chip,
  Dropdown,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  Table,
  TextArea,
  TextField,
} from "@heroui/react";
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

const typeOptions = transactionTypes.map((value) => ({
  id: value,
  label: value === "income" ? "Income" : "Expense",
}));

type TransactionForm = {
  type: (typeof transactionTypes)[number];
  amount: string;
  date: string;
  item: string;
  notes: string;
};

const emptyForm: TransactionForm = {
  type: "income",
  amount: "",
  date: "",
  item: "",
  notes: "",
};

function formFromTransaction(row: Transaction): TransactionForm {
  return {
    type: row.type,
    amount: row.amount,
    date: row.date,
    item: row.item,
    notes: row.notes,
  };
}

export default function FinancePage() {
  const session = useSession();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"item" | "date" | "amount" | "notes", string>>>({});
  const [editor, setEditor] = useState<"create" | Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ordered = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [rows],
  );
  const page = usePagedRows(ordered, 10);
  const flow = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const row of rows) {
      const amount = Number(row.amount);
      if (row.type === "income") income += amount;
      else expense += amount;
    }
    return { income, expense };
  }, [rows]);

  useEffect(() => {
    setForm((current) => ({ ...current, date: current.date || localISODate() }));
  }, []);

  const load = useCallback(async () => {
    if (!session.token || !session.clubId) return;
    const result = await api.transactions(session.token, session.clubId);
    setRows(result.transactions);
    setBalance(result.balance);
  }, [session.token, session.clubId]);

  useEffect(() => {
    if (session.status !== "in" || session.role !== "manager") return;
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load finance.");
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.role, load]);

  function validateTransactionField(field: "item" | "date" | "amount" | "notes", value: string): string | null {
    if (field === "item") return validateWithSchema(transactionWriteSchema.shape.item, value);
    if (field === "date") return validateDateInput(value, true, "Date is required.");
    if (field === "amount") return validateMoneyInput(value);
    return validateWithSchema(transactionWriteSchema.shape.notes, value);
  }

  function updateFieldError(field: "item" | "date" | "amount" | "notes", message: string | null) {
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

  function openCreate() {
    setForm({ ...emptyForm, date: localISODate() });
    setFieldErrors({});
    setEditor("create");
    setError(null);
  }

  function openEdit(row: Transaction) {
    setForm(formFromTransaction(row));
    setFieldErrors({});
    setEditor(row);
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || !editor) return;
    const itemError = validateTransactionField("item", form.item);
    const dateError = validateTransactionField("date", form.date);
    const amountError = validateTransactionField("amount", form.amount);
    const notesError = validateTransactionField("notes", form.notes);
    setFieldErrors({
      ...(itemError ? { item: itemError } : {}),
      ...(dateError ? { date: dateError } : {}),
      ...(amountError ? { amount: amountError } : {}),
      ...(notesError ? { notes: notesError } : {}),
    });
    if (!form.date.trim()) {
      setError("Date is required.");
      notifyRequired("Date");
      return;
    }
    if (!form.item.trim()) {
      setError("Item is required.");
      notifyRequired("Item");
      return;
    }
    if (!form.amount.trim()) {
      setError("Amount is required.");
      notifyRequired("Amount");
      return;
    }
    const parsed = transactionWriteSchema.safeParse({
      type: form.type,
      amount: Number(form.amount),
      date: form.date,
      item: form.item,
      notes: form.notes,
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the transaction.";
      setError(message);
      notifyZod(parsed.error, message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result =
        editor === "create"
          ? await api.createTransaction(session.token, session.clubId, parsed.data)
          : await api.updateTransaction(session.token, session.clubId, editor.id, parsed.data);
      setBalance(result.balance);
      setEditor(null);
      if (editor === "create") notifyTransactionAdded();
      else notifySaved();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the transaction.";
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
      const result = await api.deleteTransaction(session.token, session.clubId, deleting.id);
      setBalance(result.balance);
      setDeleting(null);
      notifyDeleted();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete the transaction.";
      setError(message);
      notifyDanger(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div className="page-title">
          <h1>Finance</h1>
        </div>
        <div className="page-actions">
          <NotificationCentre />
          <Button variant="primary" onPress={openCreate}>
            <Icon data={Plus} size={16} />
            Create Transaction
          </Button>
        </div>
      </div>
      <article className="card balance-card">
        <div className="stat">
          <span className="eyebrow">BALANCE</span>
          <b data-testid="balance-value">{balance ?? "–"}</b>
        </div>
        <div className="balance-chart" data-testid="balance-chart">
          <Doughnut
            data={{
              labels: ["Income", "Expense"],
              datasets: [
                {
                  data: [flow.income, flow.expense],
                  backgroundColor: ["#1aae39", "#dd5b00"],
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              plugins: { legend: { position: "bottom" } },
              maintainAspectRatio: false,
            }}
          />
        </div>
      </article>
      {error && !editor ? <p className="muted">{error}</p> : null}
      {page.loading && page.rows.length === 0 ? (
        <div className="card row">
          <Spinner />
          <span className="muted">Loading transactions…</span>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Transactions">
              <Table.Header>
                <Table.Column isRowHeader>Date</Table.Column>
                <Table.Column>Item</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Amount</Table.Column>
                <Table.Column>Notes</Table.Column>
                <Table.Column>
                  <span className="row-actions">Actions</span>
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {page.rows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>No transactions yet.</Table.Cell>
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                  </Table.Row>
                ) : (
                  page.rows.map((row) => (
                    <Table.Row key={row.id}>
                      <Table.Cell>{row.date}</Table.Cell>
                      <Table.Cell>{row.item}</Table.Cell>
                      <Table.Cell>
                        <Chip color={row.type === "income" ? "success" : "danger"} size="sm" variant="soft">
                          {row.type === "income" ? "Income" : "Expense"}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>{row.amount}</Table.Cell>
                      <Table.Cell>{row.notes || "–"}</Table.Cell>
                      <Table.Cell>
                        <div className="row-actions">
                          <Dropdown>
                            <Button isIconOnly aria-label={`Actions for ${row.item}`} size="sm" variant="secondary">
                              <Icon data={EllipsisVertical} size={16} />
                            </Button>
                            <Dropdown.Popover>
                              <Dropdown.Menu
                                aria-label={`Actions for ${row.item}`}
                                onAction={(key) => {
                                  if (key === "edit") openEdit(row);
                                  if (key === "delete") setDeleting(row);
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
      <Modal.Backdrop isOpen={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <Modal.Container>
          <Modal.Dialog className="modal-form">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{editor === "create" ? "Create Transaction" : "Edit Transaction"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form className="form-grid" onSubmit={onSubmit}>
                <TextField
                  name="item"
                  isInvalid={Boolean(fieldErrors.item)}
                  value={form.item}
                  onChange={(value) => {
                    setForm({ ...form, item: value });
                    if (fieldErrors.item) updateFieldError("item", validateTransactionField("item", value));
                  }}
                  onBlur={() => updateFieldError("item", validateTransactionField("item", form.item))}
                >
                  <Label>Name</Label>
                  <Input />
                  <FieldError>{fieldErrors.item}</FieldError>
                </TextField>
                <div className="field">
                  <span>Type</span>
                  <ChoiceMenu
                    label="Type"
                    value={form.type}
                    options={typeOptions}
                    onChange={(value) => setForm({ ...form, type: value === "expense" ? "expense" : "income" })}
                  />
                </div>
                <TextField
                  name="date"
                  type="date"
                  isInvalid={Boolean(fieldErrors.date)}
                  value={form.date}
                  onChange={(value) => {
                    setForm({ ...form, date: value });
                    if (fieldErrors.date) updateFieldError("date", validateTransactionField("date", value));
                  }}
                  onBlur={() => updateFieldError("date", validateTransactionField("date", form.date))}
                >
                  <Label>Date</Label>
                  <Input />
                  <FieldError>{fieldErrors.date}</FieldError>
                </TextField>
                <TextField
                  name="amount"
                  type="number"
                  isInvalid={Boolean(fieldErrors.amount)}
                  value={form.amount}
                  onChange={(value) => {
                    setForm({ ...form, amount: value });
                    if (fieldErrors.amount) updateFieldError("amount", validateTransactionField("amount", value));
                  }}
                  onBlur={() => updateFieldError("amount", validateTransactionField("amount", form.amount))}
                >
                  <Label>Amount</Label>
                  <Input min={0} step="0.01" />
                  <FieldError>{fieldErrors.amount}</FieldError>
                </TextField>
                <TextField
                  className="wide"
                  name="notes"
                  isInvalid={Boolean(fieldErrors.notes)}
                  value={form.notes}
                  onChange={(value) => {
                    setForm({ ...form, notes: value });
                    if (fieldErrors.notes) updateFieldError("notes", validateTransactionField("notes", value));
                  }}
                  onBlur={() => updateFieldError("notes", validateTransactionField("notes", form.notes))}
                >
                  <Label>Notes</Label>
                  <TextArea />
                  <FieldError>{fieldErrors.notes}</FieldError>
                </TextField>
                {error && editor ? <p className="muted wide">{error}</p> : null}
                <div className="wide">
                  <Button type="submit" variant="primary" isDisabled={pending}>
                    {pending ? "Saving…" : editor === "create" ? "Create Transaction" : "Save"}
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
              <Modal.Heading>Delete transaction</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>Delete {deleting?.item}? This cannot be undone.</p>
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
