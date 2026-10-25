import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, RotateCcw } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast,
  fmtMoney, ConfirmDialog,
} from "@future-erp/ui-kit";
import { useAp } from "./useAp";
import { useFinance } from "./useFinance";
import { useTax } from "./useTax";
import type { VendorBill, DebitNote, DebitNoteStatus, BillLine } from "../../data/apApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const statusTone: Record<DebitNoteStatus, PillTone> = { draft: "neutral", posted: "success", cancelled: "warning" };
const money = (v: string | number, currency?: string) => fmtMoney(v, { currency });
const today = () => new Date().toISOString().slice(0, 10);

type DraftLine = { description: string; expense_account: string; quantity: string; unit_price: string; tax_slab: string };
const emptyLine = (): DraftLine => ({ description: "", expense_account: "", quantity: "1", unit_price: "", tax_slab: "" });

export function DebitNotesPage() {
  const ap = useAp();
  const finance = useFinance();
  const tax = useTax();
  const toast = useToast();

  const [notes, setNotes] = useState<DebitNote[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [expenseOpts, setExpenseOpts] = useState<{ value: string; label: string }[]>([]);
  const [slabOpts, setSlabOpts] = useState<{ value: string; label: string }[]>([]);
  const [filter, setFilter] = useState<DebitNoteStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"new" | DebitNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState(false);

  const [billId, setBillId] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const reload = () => ap.debitNotes().then(setNotes).catch((e) => toast(e.message));

  useEffect(() => {
    Promise.all([ap.debitNotes(), ap.bills("posted"), finance.glAccounts()])
      .then(([n, b, acc]) => {
        setNotes(n); setBills(b);
        setExpenseOpts(acc.filter((x) => x.account_type === "expense" || x.account_type === "asset").map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` })));
      }).catch((e) => toast(e.message)).finally(() => setLoading(false));
    tax.regimes.list().then(async (rs) => {
      const all = (await Promise.all(rs.map((r) => tax.slabs.list(r.id)))).flat();
      setSlabOpts(all.map((s) => ({ value: s.id, label: s.name })));
    }).catch(() => {});
  }, [ap, finance, tax]); // eslint-disable-line

  const rows = useMemo(() => (filter === "all" ? notes : notes.filter((n) => n.status === filter)), [notes, filter]);
  const tabs = [
    { key: "all", label: "All", count: notes.length },
    { key: "draft", label: "Drafts", count: notes.filter((n) => n.status === "draft").length },
    { key: "posted", label: "Posted", count: notes.filter((n) => n.status === "posted").length },
  ];

  const billById = (id: string) => bills.find((x) => x.id === id);
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const openNew = () => {
    setBillId(bills[0]?.id ?? ""); setNoteDate(today()); setReason("");
    setLines([emptyLine()]); setMode("new");
  };

  const save = async (thenPost: boolean) => {
    if (!billId) return toast("Pick the bill this debit note adjusts.");
    const valid = lines.filter((l) => l.expense_account && Number(l.quantity) > 0 && Number(l.unit_price) > 0);
    if (!valid.length) return toast("Add at least one line with an account, qty and price.");
    setBusy(true);
    try {
      const created = await ap.createDebitNote({
        bill: billId, note_date: noteDate, reason,
        lines: valid.map((l, idx) => ({ line_number: idx + 1, description: l.description, expense_account: l.expense_account, quantity: l.quantity, unit_price: l.unit_price, tax_slab: l.tax_slab || null }) as BillLine),
      });
      if (thenPost) { const p = await ap.postDebitNote(created.id); toast(`Posted ${p.debit_note_number} · G/L ${p.journal_document}`); setMode(p); }
      else { toast("Draft saved"); setMode(null); }
      await reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const postExisting = async (n: DebitNote) => {
    setBusy(true);
    try { const p = await ap.postDebitNote(n.id); toast(`Posted ${p.debit_note_number} · G/L ${p.journal_document}`); setMode(p); await reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const reverseExisting = async (n: DebitNote) => {
    setBusy(true);
    try { const r = await ap.reverseDebitNote(n.id); toast(`Reversed ${r.debit_note_number}`); setMode(null); await reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const columns: Column<DebitNote>[] = [
    { key: "debit_note_number", header: "Debit note", mono: true, width: 120, render: (n) => <span className="mono" style={{ fontWeight: 600 }}>{n.debit_note_number || "—"}</span> },
    { key: "vendor_name", header: "Vendor" },
    { key: "bill_number", header: "Against bill", mono: true, width: 120 },
    { key: "note_date", header: "Date", width: 110, emphasis: "secondary" },
    { key: "grand_total", header: "Amount", numeric: true, width: 120, render: (n) => <span className="tnum">{money(n.grand_total, n.currency)}</span> },
    { key: "status", header: "Status", width: 100, render: (n) => <Pill tone={statusTone[n.status]} dot>{n.status}</Pill> },
  ];
  const viewing = mode && mode !== "new" ? (mode as DebitNote) : null;
  const selectedBill = billById(billId);

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Debit Notes</span></div>
      <div className={page.head}>
        <div><h1>Debit Notes</h1><p>Accounts Payable · reduces what we owe a vendor against a posted bill</p></div>
        <div className={page.actions}><Button variant="primary" onClick={openNew}><Plus />New debit note</Button></div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}><Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as DebitNoteStatus | "all")} /></div>
      </div>
      <SectionHeader title="Debit Notes" right={loading ? "Loading…" : `${rows.length} shown`} />
      <DataTable columns={columns} rows={rows} getRowId={(n) => n.id} onRowClick={(n) => setMode(n)} empty={loading ? "Loading…" : "No debit notes yet."} />

      <Drawer open={mode !== null} onClose={() => setMode(null)}
        title={viewing ? (viewing.debit_note_number || "Draft debit note") : "New debit note"}
        subtitle={viewing ? viewing.vendor_name : "Accounts Payable"}
        footer={viewing ? (
          viewing.status === "draft"
            ? <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => postExisting(viewing)}><Check size={16} />Post debit note</Button>
            : viewing.status === "posted"
            ? <Button style={{ flex: 1, color: "var(--warning)", borderColor: "var(--warning)" }} disabled={busy} onClick={() => setConfirmReverse(true)}><RotateCcw size={16} />Reverse</Button>
            : <span style={{ color: "var(--text-faint)", fontSize: 12 }}>This debit note has been reversed.</span>
        ) : (
          <>
            <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => save(true)}><Check size={16} />Create &amp; post</Button>
            <Button disabled={busy} onClick={() => save(false)}>Save draft</Button>
          </>
        )}>
        {viewing ? <DebitNoteView note={viewing} /> : (
          <>
            <label className={f.docField} style={{ marginBottom: 12 }}>
              <span className={f.docK}>Against bill</span>
              <select className={f.sel} value={billId} onChange={(e) => setBillId(e.target.value)}>
                <option value="">Select…</option>
                {bills.map((b) => <option key={b.id} value={b.id}>{b.bill_number} · {b.vendor_name} · {money(b.grand_total, b.currency)}</option>)}
              </select>
            </label>
            {selectedBill && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Outstanding on this bill: {money(selectedBill.outstanding, selectedBill.currency)}
              </div>
            )}
            <div className={f.docGrid}>
              <label className={f.docField}><span className={f.docK}>Note date</span>
                <input type="date" className={f.inp} value={noteDate} onChange={(e) => setNoteDate(e.target.value)} /></label>
            </div>
            <label className={f.docField} style={{ marginBottom: 16 }}><span className={f.docK}>Reason</span>
              <input className={f.inp} placeholder="e.g. Overcharged — price dispute" value={reason} onChange={(e) => setReason(e.target.value)} /></label>

            <div className={f.lineHead} style={{ gridTemplateColumns: "1.3fr 70px 100px 100px 28px" }}>
              <span>Expense account</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Price</span><span>Tax</span><span />
            </div>
            {lines.map((l, i) => (
              <div className={f.lineRow} key={i} style={{ gridTemplateColumns: "1.3fr 70px 100px 100px 28px" }}>
                <select className={f.sel} value={l.expense_account} onChange={(e) => setLine(i, { expense_account: e.target.value })}>
                  <option value="">Account…</option>
                  {expenseOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className={`${f.inp} ${f.amt}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input className={`${f.inp} ${f.amt}`} inputMode="decimal" placeholder="0.00" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                <select className={f.sel} value={l.tax_slab} onChange={(e) => setLine(i, { tax_slab: e.target.value })}>
                  <option value="">—</option>
                  {slabOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" className={f.delBtn} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" className={f.addLine} onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={14} />Add line</button>

            <div className={f.balance}>
              <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(subtotal, selectedBill?.currency)}</span></div>
              <span className={f.balStatus} style={{ color: "var(--text-muted)", fontWeight: 600 }}>Tax is computed automatically on save</span>
            </div>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmReverse}
        title="Reverse this debit note?"
        message={`This reverses ${viewing?.debit_note_number ?? "this debit note"} with a linked G/L reversal document and restores the bill's outstanding balance.`}
        confirmLabel="Reverse"
        busy={busy}
        onCancel={() => setConfirmReverse(false)}
        onConfirm={() => { setConfirmReverse(false); if (viewing) reverseExisting(viewing); }}
      />
    </div>
  );
}

function DebitNoteView({ note }: { note: DebitNote }) {
  const columns: Column<BillLine>[] = [
    { key: "line_number", header: "#", width: 34, render: (l) => l.line_number },
    { key: "description", header: "Description", render: (l) => l.description || l.expense_account_number },
    { key: "amount", header: "Amount", numeric: true, width: 120, render: (l) => money(l.amount ?? "0", note.currency) },
    { key: "tax", header: "Input tax", render: (l) => (l.taxes ?? []).map((t) => `${t.component_code} ${t.percentage}%`).join(" + ") || "—" },
  ];
  return (
    <>
      <div className={f.docMeta}>
        <div className={f.docField}><span className={f.docK}>Status</span><span className={f.docV}><Pill tone={statusTone[note.status]} dot>{note.status}</Pill></span></div>
        <div className={f.docField}><span className={f.docK}>Vendor</span><span className={f.docV}>{note.vendor_name}</span></div>
        <div className={f.docField}><span className={f.docK}>Against bill</span><span className={f.docV}>{note.bill_number}</span></div>
        <div className={f.docField}><span className={f.docK}>Note date</span><span className={f.docV}>{note.note_date}</span></div>
        <div className={f.docField}><span className={f.docK}>Reason</span><span className={f.docV}>{note.reason || "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>G/L document</span><span className={f.docV}>{note.journal_document ?? "—"}</span></div>
      </div>
      <SectionHeader title="Lines" />
      <DataTable columns={columns} rows={note.lines} getRowId={(l) => String(l.id ?? l.line_number)} minWidth={420} />
      <div className={f.balance} style={{ marginTop: 16, flexWrap: "wrap" }}>
        <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(note.subtotal, note.currency)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Input tax</span><span className={f.balVal}>{money(note.tax_total, note.currency)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Grand total</span><span className={f.balVal} style={{ color: "var(--primary)" }}>{money(note.grand_total, note.currency)}</span></div>
      </div>
    </>
  );
}
