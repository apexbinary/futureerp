import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, FileText } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast, fmtMoney,
} from "@future-erp/ui-kit";
import { useAp } from "./useAp";
import { useFinance } from "./useFinance";
import { useTax } from "./useTax";
import type { Vendor, VendorBill, BillLine, BillStatus } from "../../data/apApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const statusTone: Record<BillStatus, PillTone> = { draft: "neutral", posted: "success", cancelled: "warning" };
const money = (v: string | number) => fmtMoney(v);
const today = () => new Date().toISOString().slice(0, 10);

type DraftLine = { description: string; expense_account: string; quantity: string; unit_price: string; tax_slab: string };
const emptyLine = (): DraftLine => ({ description: "", expense_account: "", quantity: "1", unit_price: "", tax_slab: "" });

export function VendorBillsPage() {
  const ap = useAp();
  const finance = useFinance();
  const tax = useTax();
  const toast = useToast();

  const [bills, setBills] = useState<VendorBill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenseOpts, setExpenseOpts] = useState<{ value: string; label: string }[]>([]);
  const [slabOpts, setSlabOpts] = useState<{ value: string; label: string }[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [filter, setFilter] = useState<BillStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"new" | VendorBill | null>(null);
  const [busy, setBusy] = useState(false);

  const [vendor, setVendor] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [baselineDate, setBaselineDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [vendorRef, setVendorRef] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const reload = () => ap.bills().then(setBills).catch((e) => toast(e.message));
  useEffect(() => {
    Promise.all([ap.bills(), ap.vendors(), finance.glAccounts(), finance.companyCodes()])
      .then(([b, v, acc, cc]) => {
        setBills(b); setVendors(v);
        setExpenseOpts(acc.filter((x) => x.account_type === "expense" || x.account_type === "asset").map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` })));
        if (cc[0]) setCompanyCode(cc[0].id);
      }).catch((e) => toast(e.message)).finally(() => setLoading(false));
    tax.regimes.list().then(async (rs) => {
      const all = (await Promise.all(rs.map((r) => tax.slabs.list(r.id)))).flat();
      setSlabOpts(all.map((s) => ({ value: s.id, label: s.name })));
    }).catch(() => {});
  }, [ap, finance, tax]); // eslint-disable-line

  const rows = useMemo(() => (filter === "all" ? bills : bills.filter((b) => b.status === filter)), [bills, filter]);
  const tabs = [
    { key: "all", label: "All", count: bills.length },
    { key: "draft", label: "Drafts", count: bills.filter((b) => b.status === "draft").length },
    { key: "posted", label: "Posted", count: bills.filter((b) => b.status === "posted").length },
  ];

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const openNew = () => {
    const first = vendors[0];
    setVendor(first?.id ?? ""); setBillDate(today()); setBaselineDate(today());
    setDueDate(""); setPaymentTerms(first?.payment_terms ?? ""); setVendorRef(""); setNotes("");
    setLines([emptyLine()]); setMode("new");
  };
  const pickVendor = (id: string) => {
    setVendor(id);
    const v = vendors.find((x) => x.id === id);
    if (v && !paymentTerms) setPaymentTerms(v.payment_terms ?? "");
  };

  const save = async (thenPost: boolean) => {
    if (!companyCode) return toast("Company code unavailable.");
    if (!vendor) return toast("Pick a vendor.");
    const valid = lines.filter((l) => l.expense_account && Number(l.quantity) > 0 && Number(l.unit_price) > 0);
    if (!valid.length) return toast("Add at least one line with an account, qty and price.");
    setBusy(true);
    try {
      const created = await ap.createBill({
        company_code: companyCode, vendor, bill_date: billDate, vendor_ref: vendorRef,
        baseline_date: baselineDate || null, due_date: dueDate || null,
        payment_terms: paymentTerms, notes,
        lines: valid.map((l, idx) => ({ line_number: idx + 1, description: l.description, expense_account: l.expense_account, quantity: l.quantity, unit_price: l.unit_price, tax_slab: l.tax_slab || null }) as BillLine),
      });
      if (thenPost) { const p = await ap.postBill(created.id); toast(`Posted ${p.bill_number} · G/L ${p.journal_document}`); setMode(p); }
      else { toast("Draft saved"); setMode(null); }
      await reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const postExisting = async (b: VendorBill) => {
    setBusy(true);
    try { const p = await ap.postBill(b.id); toast(`Posted ${p.bill_number} · G/L ${p.journal_document}`); setMode(p); await reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const settleTone: Record<string, PillTone> = { paid: "success", partial: "warning", open: "danger", unposted: "neutral" };
  const columns: Column<VendorBill>[] = [
    { key: "bill_number", header: "Bill", mono: true, width: 120, render: (b) => <span className="mono" style={{ fontWeight: 600 }}>{b.bill_number || "—"}</span> },
    { key: "vendor_name", header: "Vendor" },
    { key: "bill_date", header: "Date", width: 110, emphasis: "secondary" },
    { key: "grand_total", header: "Total", numeric: true, width: 120, render: (b) => <span className="tnum">{money(b.grand_total)}</span> },
    { key: "outstanding", header: "Outstanding", numeric: true, width: 120, render: (b) => <span className="tnum" style={{ color: Number(b.outstanding) > 0 ? "var(--danger)" : "var(--text-faint)" }}>{money(b.outstanding)}</span> },
    { key: "settlement_status", header: "Settlement", width: 110, render: (b) => (b.status === "posted" ? <Pill tone={settleTone[b.settlement_status]} dot>{b.settlement_status}</Pill> : <Pill tone="neutral">{b.status}</Pill>) },
  ];
  const viewing = mode && mode !== "new" ? (mode as VendorBill) : null;

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Vendor Bills (AP)</span></div>
      <div className={page.head}>
        <div><h1>Vendor Bills</h1><p>Accounts Payable · input tax auto-computed, posts to the General Ledger</p></div>
        <div className={page.actions}><Button variant="primary" onClick={openNew}><Plus />New bill</Button></div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}><Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as BillStatus | "all")} /></div>
      </div>
      <SectionHeader title="Bills" right={loading ? "Loading…" : `${rows.length} shown`} />
      <DataTable columns={columns} rows={rows} getRowId={(b) => b.id} onRowClick={(b) => setMode(b)} empty={loading ? "Loading…" : "No bills yet."} />

      <Drawer open={mode !== null} onClose={() => setMode(null)}
        title={viewing ? (viewing.bill_number || "Draft bill") : "New vendor bill"}
        subtitle={viewing ? viewing.vendor_name : "Accounts Payable"}
        footer={viewing ? (
          viewing.status === "draft"
            ? <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => postExisting(viewing)}><Check size={16} />Post bill</Button>
            : <span style={{ color: "var(--text-faint)", fontSize: 12 }}>Posted · G/L {viewing.journal_document}</span>
        ) : (
          <>
            <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => save(true)}><Check size={16} />Create &amp; post</Button>
            <Button disabled={busy} onClick={() => save(false)}>Save draft</Button>
          </>
        )}>
        {viewing ? <BillView bill={viewing} /> : (
          <>
            <label className={f.docField} style={{ marginBottom: 12 }}>
              <span className={f.docK}>Vendor</span>
              <select className={f.sel} value={vendor} onChange={(e) => pickVendor(e.target.value)}>
                <option value="">Select…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.state}</option>)}
              </select>
            </label>
            <div className={f.docGrid}>
              <label className={f.docField}><span className={f.docK}>Bill date</span>
                <input type="date" className={f.inp} value={billDate} onChange={(e) => setBillDate(e.target.value)} /></label>
              <label className={f.docField}><span className={f.docK}>Vendor ref</span>
                <input className={f.inp} placeholder="their invoice #" value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} /></label>
              <label className={f.docField}><span className={f.docK}>Baseline date</span>
                <input type="date" className={f.inp} value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} title="Date from which payment terms are counted" /></label>
              <label className={f.docField}><span className={f.docK}>Payment terms</span>
                <input className={f.inp} placeholder="e.g. Net 30" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></label>
              <label className={f.docField}><span className={f.docK}>Due date</span>
                <input type="date" className={f.inp} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
              <label className={f.docField}><span className={f.docK}>Notes</span>
                <input className={f.inp} placeholder="Optional remarks" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            </div>

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
              <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(subtotal)}</span></div>
              <span className={f.balStatus} style={{ color: "var(--text-muted)", fontWeight: 600 }}><FileText size={14} />Input tax computed on posting</span>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

function BillView({ bill }: { bill: VendorBill }) {
  const columns: Column<BillLine>[] = [
    { key: "line_number", header: "#", width: 34, render: (l) => l.line_number },
    { key: "description", header: "Description", render: (l) => l.description || l.expense_account_number },
    { key: "amount", header: "Amount", numeric: true, width: 120, render: (l) => money(l.amount ?? "0") },
    { key: "tax", header: "Input tax", render: (l) => (l.taxes ?? []).map((t) => `${t.component_code} ${t.percentage}%`).join(" + ") || "—" },
  ];
  return (
    <>
      <div className={f.docMeta}>
        <div className={f.docField}><span className={f.docK}>Status</span><span className={f.docV}><Pill tone={statusTone[bill.status]} dot>{bill.status}</Pill></span></div>
        <div className={f.docField}><span className={f.docK}>Vendor</span><span className={f.docV}>{bill.vendor_name}</span></div>
        <div className={f.docField}><span className={f.docK}>Bill date</span><span className={f.docV}>{bill.bill_date}</span></div>
        <div className={f.docField}><span className={f.docK}>Baseline date</span><span className={f.docV}>{bill.baseline_date ?? "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>Payment terms</span><span className={f.docV}>{bill.payment_terms || "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>Due date</span><span className={f.docV}>{bill.due_date ?? "—"}</span></div>
        {bill.vendor_ref && <div className={f.docField}><span className={f.docK}>Vendor ref</span><span className={f.docV}>{bill.vendor_ref}</span></div>}
        <div className={f.docField}><span className={f.docK}>G/L document</span><span className={f.docV}>{bill.journal_document ?? "—"}</span></div>
      </div>
      <SectionHeader title="Lines" />
      <DataTable columns={columns} rows={bill.lines} getRowId={(l) => String(l.id ?? l.line_number)} minWidth={420} />
      <div className={f.balance} style={{ marginTop: 16, flexWrap: "wrap" }}>
        <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(bill.subtotal)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Input tax</span><span className={f.balVal}>{money(bill.tax_total)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Grand total</span><span className={f.balVal} style={{ color: "var(--primary)" }}>{money(bill.grand_total)}</span></div>
      </div>
    </>
  );
}
