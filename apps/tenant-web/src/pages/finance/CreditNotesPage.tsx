import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, RotateCcw } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast,
  fmtMoney, ConfirmDialog,
} from "@future-erp/ui-kit";
import { useAr } from "./useAr";
import { useFinance } from "./useFinance";
import type { Customer, Item, CustomerInvoice, CreditNote, CreditNoteStatus, InvoiceLine } from "../../data/arApi";
import type { ExchangeRate } from "../../data/financeApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const statusTone: Record<CreditNoteStatus, PillTone> = { draft: "neutral", posted: "success", cancelled: "warning" };
const money = (v: string | number, currency?: string) => fmtMoney(v, { currency });
const today = () => new Date().toISOString().slice(0, 10);

type DraftLine = { item: string; quantity: string; unit_price: string };
const emptyLine = (): DraftLine => ({ item: "", quantity: "1", unit_price: "" });

export function CreditNotesPage() {
  const api = useAr();
  const finance = useFinance();
  const toast = useToast();

  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [filter, setFilter] = useState<CreditNoteStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"new" | CreditNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState(false);

  const [invoiceId, setInvoiceId] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const reload = () => api.creditNotes().then(setNotes).catch((e) => toast(e.message));

  useEffect(() => {
    Promise.all([api.creditNotes(), api.invoices("posted"), api.items(), finance.exchangeRates()])
      .then(([n, inv, it, fx]) => { setNotes(n); setInvoices(inv); setItems(it); setRates(fx); })
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => (filter === "all" ? notes : notes.filter((n) => n.status === filter)),
    [notes, filter],
  );
  const tabs = [
    { key: "all", label: "All", count: notes.length },
    { key: "draft", label: "Drafts", count: notes.filter((n) => n.status === "draft").length },
    { key: "posted", label: "Posted", count: notes.filter((n) => n.status === "posted").length },
  ];

  const itemById = (id: string) => items.find((x) => x.id === id);
  const invoiceById = (id: string) => invoices.find((x) => x.id === id);
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Item.unit_price is always in the company's base currency — the note always
  // takes the currency of the invoice it's crediting, so convert into that.
  const resolveRate = (curr: string, asOf: string): number => {
    if (curr === "INR") return 1;
    const candidate = rates
      .filter((r) => r.currency === curr && r.rate_date <= asOf)
      .sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1))[0];
    return candidate ? Number(candidate.rate_to_base) : 1;
  };
  const priceInCurrency = (basePrice: string): string => {
    if (!selectedInvoice || selectedInvoice.currency === "INR") return basePrice;
    const rate = resolveRate(selectedInvoice.currency, noteDate);
    return rate === 1 ? basePrice : (Number(basePrice) / rate).toFixed(2);
  };

  const pickItem = (i: number, itemId: string) => {
    const it = itemById(itemId);
    setLine(i, { item: itemId, unit_price: it ? priceInCurrency(it.unit_price) : "" });
  };

  const openNew = () => {
    setInvoiceId(invoices[0]?.id ?? ""); setNoteDate(today()); setReason("");
    setLines([emptyLine()]); setMode("new");
  };

  const save = async (thenPost: boolean) => {
    if (!invoiceId) return toast("Pick the invoice this credit note adjusts.");
    const valid = lines.filter((l) => l.item && Number(l.quantity) > 0);
    if (!valid.length) return toast("Add at least one line.");
    setBusy(true);
    try {
      const created = await api.createCreditNote({
        invoice: invoiceId, note_date: noteDate, reason,
        lines: valid.map((l, idx) => ({
          line_number: idx + 1, item: l.item, quantity: l.quantity, unit_price: l.unit_price,
        }) as InvoiceLine),
      });
      if (thenPost) {
        const posted = await api.postCreditNote(created.id);
        toast(`Posted ${posted.credit_note_number} · G/L ${posted.journal_document}`);
        setMode(posted);
      } else {
        toast("Draft saved");
        setMode(null);
      }
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const postExisting = async (n: CreditNote) => {
    setBusy(true);
    try {
      const posted = await api.postCreditNote(n.id);
      toast(`Posted ${posted.credit_note_number} · G/L ${posted.journal_document}`);
      setMode(posted); await reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const reverseExisting = async (n: CreditNote) => {
    setBusy(true);
    try {
      const reversed = await api.reverseCreditNote(n.id);
      toast(`Reversed ${reversed.credit_note_number}`);
      setMode(null); await reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const columns: Column<CreditNote>[] = [
    { key: "credit_note_number", header: "Credit note", mono: true, width: 120,
      render: (n) => <span className="mono" style={{ fontWeight: 600 }}>{n.credit_note_number || "—"}</span> },
    { key: "customer_name", header: "Customer" },
    { key: "invoice_number", header: "Against invoice", mono: true, width: 120 },
    { key: "note_date", header: "Date", width: 110, emphasis: "secondary" },
    { key: "grand_total", header: "Amount", numeric: true, width: 120,
      render: (n) => <span className="tnum">{money(n.grand_total, n.currency)}</span> },
    { key: "status", header: "Status", width: 100, render: (n) => <Pill tone={statusTone[n.status]} dot>{n.status}</Pill> },
  ];

  const viewing = mode && mode !== "new" ? (mode as CreditNote) : null;
  const selectedInvoice = invoiceById(invoiceId);

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Credit Notes</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Credit Notes</h1>
          <p>Accounts Receivable · reduces what a customer owes against a posted invoice</p>
        </div>
        <div className={page.actions}>
          <Button variant="primary" onClick={openNew}><Plus />New credit note</Button>
        </div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as CreditNoteStatus | "all")} />
        </div>
      </div>

      <SectionHeader title="Credit Notes" right={loading ? "Loading…" : `${rows.length} shown`} />
      <DataTable columns={columns} rows={rows} getRowId={(n) => n.id}
        onRowClick={(n) => setMode(n)} empty={loading ? "Loading…" : "No credit notes yet."} />

      <Drawer
        open={mode !== null}
        onClose={() => setMode(null)}
        title={viewing ? (viewing.credit_note_number || "Draft credit note") : "New credit note"}
        subtitle={viewing ? viewing.customer_name : "Accounts Receivable"}
        footer={
          viewing ? (
            viewing.status === "draft" ? (
              <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => postExisting(viewing)}>
                <Check size={16} />Post credit note
              </Button>
            ) : viewing.status === "posted" ? (
              <Button style={{ flex: 1, color: "var(--warning)", borderColor: "var(--warning)" }} disabled={busy} onClick={() => setConfirmReverse(true)}>
                <RotateCcw size={16} />Reverse
              </Button>
            ) : (
              <span style={{ color: "var(--text-faint)", fontSize: 12 }}>This credit note has been reversed.</span>
            )
          ) : (
            <>
              <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => save(true)}>
                <Check size={16} />Create &amp; post
              </Button>
              <Button disabled={busy} onClick={() => save(false)}>Save draft</Button>
            </>
          )
        }
      >
        {viewing ? <CreditNoteView note={viewing} /> : (
          <>
            <label className={f.docField} style={{ marginBottom: 12 }}>
              <span className={f.docK}>Against invoice</span>
              <select className={f.sel} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Select…</option>
                {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_number} · {inv.customer_name} · {money(inv.grand_total, inv.currency)}</option>)}
              </select>
            </label>
            {selectedInvoice && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Outstanding on this invoice: {money(selectedInvoice.outstanding, selectedInvoice.currency)}
              </div>
            )}
            <div className={f.docGrid}>
              <label className={f.docField}>
                <span className={f.docK}>Note date</span>
                <input type="date" className={f.inp} value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
              </label>
            </div>
            <label className={f.docField} style={{ marginBottom: 16 }}>
              <span className={f.docK}>Reason</span>
              <input className={f.inp} placeholder="e.g. Damaged goods — partial return" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>

            <div className={f.lineHead} style={{ gridTemplateColumns: "1fr 64px 110px 110px 28px" }}>
              <span>Item</span><span style={{ textAlign: "right" }}>Qty</span>
              <span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "right" }}>Amount</span><span />
            </div>
            {lines.map((l, i) => {
              const amt = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
              return (
                <div className={f.lineRow} key={i} style={{ gridTemplateColumns: "1fr 64px 110px 110px 28px" }}>
                  <select className={f.sel} value={l.item} onChange={(e) => pickItem(i, e.target.value)}>
                    <option value="">Select item…</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}
                  </select>
                  <input className={`${f.inp} ${f.amt}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <input className={`${f.inp} ${f.amt}`} inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                  <input className={`${f.inp} ${f.amt}`} value={money(amt, selectedInvoice?.currency)} readOnly tabIndex={-1} style={{ color: "var(--text-muted)" }} />
                  <button type="button" className={f.delBtn} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label="Remove line">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            <button type="button" className={f.addLine} onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus size={14} />Add line
            </button>

            <div className={f.balance}>
              <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(subtotal, selectedInvoice?.currency)}</span></div>
              <span className={f.balStatus} style={{ color: "var(--text-muted)", fontWeight: 600 }}>Tax is computed automatically on save</span>
            </div>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmReverse}
        title="Reverse this credit note?"
        message={`This reverses ${viewing?.credit_note_number ?? "this credit note"} with a linked G/L reversal document and restores the invoice's outstanding balance.`}
        confirmLabel="Reverse"
        busy={busy}
        onCancel={() => setConfirmReverse(false)}
        onConfirm={() => { setConfirmReverse(false); if (viewing) reverseExisting(viewing); }}
      />
    </div>
  );
}

function CreditNoteView({ note }: { note: CreditNote }) {
  const columns: Column<InvoiceLine>[] = [
    { key: "line_number", header: "#", width: 34, render: (l) => l.line_number },
    { key: "item_name", header: "Item", render: (l) => l.item_name ?? l.description },
    { key: "quantity", header: "Qty", numeric: true, width: 64 },
    { key: "unit_price", header: "Price", numeric: true, width: 100, render: (l) => money(l.unit_price, note.currency) },
    { key: "amount", header: "Amount", numeric: true, width: 110, render: (l) => money(l.amount ?? "0", note.currency) },
    { key: "tax", header: "Tax", render: (l) => (l.taxes ?? []).map((t) => `${t.component_code} ${t.percentage}%`).join(" + ") || "—" },
  ];
  return (
    <>
      <div className={f.docMeta}>
        <div className={f.docField}><span className={f.docK}>Status</span>
          <span className={f.docV}><Pill tone={statusTone[note.status]} dot>{note.status}</Pill></span></div>
        <div className={f.docField}><span className={f.docK}>Customer</span><span className={f.docV}>{note.customer_name}</span></div>
        <div className={f.docField}><span className={f.docK}>Against invoice</span><span className={f.docV}>{note.invoice_number}</span></div>
        <div className={f.docField}><span className={f.docK}>Note date</span><span className={f.docV}>{note.note_date}</span></div>
        <div className={f.docField}><span className={f.docK}>Reason</span><span className={f.docV}>{note.reason || "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>G/L document</span><span className={f.docV}>{note.journal_document ?? "—"}</span></div>
      </div>
      <SectionHeader title="Lines" />
      <DataTable columns={columns} rows={note.lines} getRowId={(l) => String(l.id ?? l.line_number)} minWidth={420} />
      <div className={f.balance} style={{ marginTop: 16, flexWrap: "wrap" }}>
        <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(note.subtotal, note.currency)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Tax</span><span className={f.balVal}>{money(note.tax_total, note.currency)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Grand total</span><span className={f.balVal} style={{ color: "var(--primary)" }}>{money(note.grand_total, note.currency)}</span></div>
      </div>
    </>
  );
}
