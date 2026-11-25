"use client";

import { ChoiceMenu } from "@/components/ChoiceMenu";
import { api } from "@/lib/api";
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

  function openCreate() {
    setForm({ ...emptyForm, date: localISODate() });
    setEditor("create");
    setError(null);
  }

  function openEdit(row: Transaction) {
    setForm(formFromTransaction(row));
    setEditor(row);
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session.token || !session.clubId || !editor) return;
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
        <Button variant="primary" onPress={openCreate}>
          <Icon data={Plus} size={16} />
          Create Transaction
        </Button>
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
                <TextField name="item" value={form.item} onChange={(value) => setForm({ ...form, item: value })}>
                  <Label>Name</Label>
                  <Input />
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
                <TextField name="date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })}>
                  <Label>Date</Label>
                  <Input />
                </TextField>
                <TextField
                  name="amount"
                  type="number"
                  value={form.amount}
                  onChange={(value) => setForm({ ...form, amount: value })}
                >
                  <Label>Amount</Label>
                  <Input min={0} step="0.01" />
                </TextField>
                <TextField className="wide" name="notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })}>
                  <Label>Notes</Label>
                  <TextArea />
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
