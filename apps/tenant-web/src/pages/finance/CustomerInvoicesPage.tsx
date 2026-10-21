import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, FileText } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast,
  fmtMoney,
} from "@future-erp/ui-kit";
import { useAr } from "./useAr";
import { useFinance } from "./useFinance";
import type {
  Customer, Item, CustomerInvoice, InvoiceLine, InvoiceStatus,
} from "../../data/arApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const statusTone: Record<InvoiceStatus, PillTone> = { draft: "neutral", posted: "success", cancelled: "warning" };
const money = (v: string | number) => fmtMoney(v);

type DraftLine = { item: string; quantity: string; unit_price: string };
const emptyLine = (): DraftLine => ({ item: "", quantity: "1", unit_price: "" });
const today = () => new Date().toISOString().slice(0, 10);

export function CustomerInvoicesPage() {
  const api = useAr();
  const finance = useFinance();
  const toast = useToast();

  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [companyCode, setCompanyCode] = useState<string>("");
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"new" | CustomerInvoice | null>(null);
  const [busy, setBusy] = useState(false);

  // compose
  const [customer, setCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [baselineDate, setBaselineDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const reload = () => api.invoices().then(setInvoices).catch((e) => toast(e.message));

  useEffect(() => {
    Promise.all([api.invoices(), api.customers(), api.items(), finance.companyCodes()])
      .then(([inv, cu, it, cc]) => {
        setInvoices(inv); setCustomers(cu); setItems(it);
        if (cc[0]) setCompanyCode(cc[0].id);
      })
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, [api, finance]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => (filter === "all" ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter],
  );
  const tabs = [
    { key: "all", label: "All", count: invoices.length },
    { key: "draft", label: "Drafts", count: invoices.filter((i) => i.status === "draft").length },
    { key: "posted", label: "Posted", count: invoices.filter((i) => i.status === "posted").length },
  ];

  const itemById = (id: string) => items.find((x) => x.id === id);
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const pickItem = (i: number, itemId: string) => {
    const it = itemById(itemId);
    setLine(i, { item: itemId, unit_price: it ? it.unit_price : "" });
  };

  const openNew = () => {
    const first = customers[0];
    setCustomer(first?.id ?? ""); setInvoiceDate(today()); setBaselineDate(today());
    setDueDate(""); setPaymentTerms(first?.payment_terms ?? ""); setNotes("");
    setLines([emptyLine()]); setMode("new");
  };

  // When the customer changes, default payment terms from their master record.
  const pickCustomer = (id: string) => {
    setCustomer(id);
    const c = customers.find((x) => x.id === id);
    if (c && !paymentTerms) setPaymentTerms(c.payment_terms ?? "");
  };

  const save = async (thenPost: boolean) => {
    const cc = companyCode || invoices[0]?.company_code;
    if (!cc) return toast("Company code unavailable — create a journal entry first to initialise.");
    if (!customer) return toast("Pick a customer.");
    const valid = lines.filter((l) => l.item && Number(l.quantity) > 0);
    if (!valid.length) return toast("Add at least one line.");
    setBusy(true);
    try {
      const created = await api.createInvoice({
        company_code: cc, customer, invoice_date: invoiceDate,
        baseline_date: baselineDate || null, due_date: dueDate || null,
        payment_terms: paymentTerms, notes,
        lines: valid.map((l, idx) => ({
          line_number: idx + 1, item: l.item, quantity: l.quantity, unit_price: l.unit_price,
        }) as InvoiceLine),
      });
      if (thenPost) {
        const posted = await api.postInvoice(created.id);
        toast(`Posted ${posted.invoice_number} · G/L ${posted.journal_document}`);
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

  const postExisting = async (inv: CustomerInvoice) => {
    setBusy(true);
    try {
      const posted = await api.postInvoice(inv.id);
      toast(`Posted ${posted.invoice_number} · G/L ${posted.journal_document}`);
      setMode(posted); await reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const settleTone: Record<string, PillTone> = { paid: "success", partial: "warning", open: "danger", unposted: "neutral" };
  const columns: Column<CustomerInvoice>[] = [
    { key: "invoice_number", header: "Invoice", mono: true, width: 120,
      render: (i) => <span className="mono" style={{ fontWeight: 600 }}>{i.invoice_number || "—"}</span> },
    { key: "customer_name", header: "Customer" },
    { key: "invoice_date", header: "Date", width: 110, emphasis: "secondary" },
    { key: "grand_total", header: "Total", numeric: true, width: 120,
      render: (i) => <span className="tnum">{money(i.grand_total)}</span> },
    { key: "outstanding", header: "Outstanding", numeric: true, width: 120,
      render: (i) => <span className="tnum" style={{ color: Number(i.outstanding) > 0 ? "var(--danger)" : "var(--text-faint)" }}>{money(i.outstanding)}</span> },
    { key: "settlement_status", header: "Settlement", width: 110,
      render: (i) => (i.status === "posted" ? <Pill tone={settleTone[i.settlement_status]} dot>{i.settlement_status}</Pill> : <Pill tone="neutral">{i.status}</Pill>) },
  ];

  const viewing = mode && mode !== "new" ? (mode as CustomerInvoice) : null;

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Invoices (AR)</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Customer Invoices</h1>
          <p>Accounts Receivable · tax auto-computed, posts to the General Ledger</p>
        </div>
        <div className={page.actions}>
          <Button variant="primary" onClick={openNew}><Plus />New invoice</Button>
        </div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as InvoiceStatus | "all")} />
        </div>
      </div>

      <SectionHeader title="Invoices" right={loading ? "Loading…" : `${rows.length} shown`} />
      <DataTable columns={columns} rows={rows} getRowId={(i) => i.id}
        onRowClick={(i) => setMode(i)} empty={loading ? "Loading…" : "No invoices yet."} />

      <Drawer
        open={mode !== null}
        onClose={() => setMode(null)}
        title={viewing ? (viewing.invoice_number || "Draft invoice") : "New invoice"}
        subtitle={viewing ? viewing.customer_name : "Accounts Receivable"}
        footer={
          viewing ? (
            viewing.status === "draft" ? (
              <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => postExisting(viewing)}>
                <Check size={16} />Post invoice
              </Button>
            ) : (
              <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                Posted · linked to G/L {viewing.journal_document}
              </span>
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
        {viewing ? <InvoiceView inv={viewing} /> : (
          <>
            <label className={f.docField} style={{ marginBottom: 12 }}>
              <span className={f.docK}>Customer</span>
              <select className={f.sel} value={customer} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">Select…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.state}</option>)}
              </select>
            </label>
            <div className={f.docGrid}>
              <label className={f.docField}>
                <span className={f.docK}>Invoice date</span>
                <input type="date" className={f.inp} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </label>
              <label className={f.docField}>
                <span className={f.docK}>Baseline date</span>
                <input type="date" className={f.inp} value={baselineDate} onChange={(e) => setBaselineDate(e.target.value)} title="Date from which payment terms are counted" />
              </label>
              <label className={f.docField}>
                <span className={f.docK}>Payment terms</span>
                <input className={f.inp} placeholder="e.g. Net 30" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </label>
              <label className={f.docField}>
                <span className={f.docK}>Due date</span>
                <input type="date" className={f.inp} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </div>
            <label className={f.docField} style={{ marginBottom: 16 }}>
              <span className={f.docK}>Notes</span>
              <input className={f.inp} placeholder="Optional reference / remarks" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                    {items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}{it.tax_slab_name ? ` (${it.tax_slab_name})` : ""}</option>)}
                  </select>
                  <input className={`${f.inp} ${f.amt}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <input className={`${f.inp} ${f.amt}`} inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                  <input className={`${f.inp} ${f.amt}`} value={money(amt)} readOnly tabIndex={-1} style={{ color: "var(--text-muted)" }} />
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
              <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(subtotal)}</span></div>
              <span className={f.balStatus} style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                <FileText size={14} />Tax is computed automatically on posting
              </span>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

function InvoiceView({ inv }: { inv: CustomerInvoice }) {
  const columns: Column<InvoiceLine>[] = [
    { key: "line_number", header: "#", width: 34, render: (l) => l.line_number },
    { key: "item_name", header: "Item", render: (l) => l.item_name ?? l.description },
    { key: "quantity", header: "Qty", numeric: true, width: 64 },
    { key: "unit_price", header: "Price", numeric: true, width: 100, render: (l) => money(l.unit_price) },
    { key: "amount", header: "Amount", numeric: true, width: 110, render: (l) => money(l.amount ?? "0") },
    { key: "tax", header: "Tax", render: (l) => (l.taxes ?? []).map((t) => `${t.component_code} ${t.percentage}%`).join(" + ") || "—" },
  ];
  return (
    <>
      <div className={f.docMeta}>
        <div className={f.docField}><span className={f.docK}>Status</span>
          <span className={f.docV}><Pill tone={statusTone[inv.status]} dot>{inv.status}</Pill></span></div>
        <div className={f.docField}><span className={f.docK}>Customer</span><span className={f.docV}>{inv.customer_name}</span></div>
        <div className={f.docField}><span className={f.docK}>Invoice date</span><span className={f.docV}>{inv.invoice_date}</span></div>
        <div className={f.docField}><span className={f.docK}>Baseline date</span><span className={f.docV}>{inv.baseline_date ?? "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>Payment terms</span><span className={f.docV}>{inv.payment_terms || "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>Due date</span><span className={f.docV}>{inv.due_date ?? "—"}</span></div>
        <div className={f.docField}><span className={f.docK}>G/L document</span><span className={f.docV}>{inv.journal_document ?? "—"}</span></div>
      </div>
      <SectionHeader title="Lines" />
      <DataTable columns={columns} rows={inv.lines} getRowId={(l) => String(l.id ?? l.line_number)} minWidth={420} />
      <div className={f.balance} style={{ marginTop: 16, flexWrap: "wrap" }}>
        <div className={f.balItem}><span className={f.balLabel}>Subtotal</span><span className={f.balVal}>{money(inv.subtotal)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Tax</span><span className={f.balVal}>{money(inv.tax_total)}</span></div>
        <div className={f.balItem}><span className={f.balLabel}>Grand total</span><span className={f.balVal} style={{ color: "var(--primary)" }}>{money(inv.grand_total)}</span></div>
      </div>
    </>
  );
}
