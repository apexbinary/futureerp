import { useEffect, useMemo, useState } from "react";
import { Plus, Check, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast, fmtMoney,
} from "@future-erp/ui-kit";
import { useAuth } from "@future-erp/ui-kit";
import { paymentsApi, type Payment, type Direction } from "../../data/paymentsApi";
import { useAr } from "./useAr";
import { useAp } from "./useAp";
import { useFinance } from "./useFinance";
import type { Customer } from "../../data/arApi";
import type { Vendor } from "../../data/apApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const today = () => new Date().toISOString().slice(0, 10);

export function PaymentsPage() {
  const { authFetch } = useAuth();
  const api = useMemo(() => paymentsApi(authFetch), [authFetch]);
  const ar = useAr();
  const ap = useAp();
  const finance = useFinance();
  const toast = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bankOpts, setBankOpts] = useState<{ value: string; label: string }[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [filter, setFilter] = useState<Direction | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // compose
  const [direction, setDirection] = useState<Direction>("receipt");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [bank, setBank] = useState("");

  const reload = () => api.list().then(setPayments).catch((e) => toast(e.message));
  useEffect(() => {
    Promise.all([api.list(), ar.customers(), ap.vendors(), finance.glAccounts(), finance.companyCodes()])
      .then(([p, c, v, acc, cc]) => {
        setPayments(p); setCustomers(c); setVendors(v);
        setBankOpts(acc.filter((x) => x.account_type === "asset").map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` })));
        if (cc[0]) setCompanyCode(cc[0].id);
      }).catch((e) => toast(e.message)).finally(() => setLoading(false));
  }, [api, ar, ap, finance]); // eslint-disable-line

  const rows = useMemo(() => (filter === "all" ? payments : payments.filter((p) => p.direction === filter)), [payments, filter]);
  const tabs = [
    { key: "all", label: "All", count: payments.length },
    { key: "receipt", label: "Receipts", count: payments.filter((p) => p.direction === "receipt").length },
    { key: "payment", label: "Payments", count: payments.filter((p) => p.direction === "payment").length },
  ];

  const openNew = () => { setDirection("receipt"); setParty(""); setAmount(""); setDate(today()); setBank(""); setOpen(true); };

  const save = async () => {
    if (!companyCode) return toast("Company code unavailable.");
    if (!party) return toast(direction === "receipt" ? "Pick a customer." : "Pick a vendor.");
    if (!(Number(amount) > 0)) return toast("Enter an amount.");
    setBusy(true);
    try {
      const created = await api.create({
        company_code: companyCode, direction, payment_date: date, amount,
        bank_account: bank || null,
        customer: direction === "receipt" ? party : null,
        vendor: direction === "payment" ? party : null,
      });
      const posted = await api.post(created.id);
      toast(`Posted ${posted.payment_number} · G/L ${posted.journal_document}`);
      setOpen(false); await reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const statusTone: Record<string, PillTone> = { draft: "neutral", posted: "success" };
  const columns: Column<Payment>[] = [
    { key: "payment_number", header: "Number", mono: true, width: 120, render: (p) => <span className="mono" style={{ fontWeight: 600 }}>{p.payment_number || "—"}</span> },
    { key: "direction", header: "Type", width: 120,
      render: (p) => p.direction === "receipt"
        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--success)" }}><ArrowDownLeft size={14} />Receipt</span>
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--warning)" }}><ArrowUpRight size={14} />Payment</span> },
    { key: "party_name", header: "Party" },
    { key: "payment_date", header: "Date", width: 110, emphasis: "secondary" },
    { key: "amount", header: "Amount", numeric: true, width: 130, render: (p) => <span className="tnum">{fmtMoney(p.amount)}</span> },
    { key: "journal_document", header: "G/L", mono: true, width: 120, emphasis: "secondary", render: (p) => p.journal_document || "—" },
    { key: "status", header: "Status", width: 100, render: (p) => <Pill tone={statusTone[p.status]} dot>{p.status[0].toUpperCase() + p.status.slice(1)}</Pill> },
  ];

  const parties = direction === "receipt" ? customers : vendors;

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Payments</span></div>
      <div className={page.head}>
        <div><h1>Payments</h1><p>Customer receipts &amp; vendor payments — each posts to the General Ledger</p></div>
        <div className={page.actions}><Button variant="primary" onClick={openNew}><Plus />New payment</Button></div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}><Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as Direction | "all")} /></div>
      </div>
      <SectionHeader title="Payments" right={loading ? "Loading…" : `${rows.length} shown`} />
      <DataTable columns={columns} rows={rows} getRowId={(p) => p.id} empty={loading ? "Loading…" : "No payments yet."} />

      <Drawer open={open} onClose={() => setOpen(false)} title="New payment" subtitle="Receipt or payment"
        footer={<Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={save}><Check size={16} />Record &amp; post</Button>}>
        <div className={f.docField} style={{ marginBottom: 14 }}>
          <span className={f.docK}>Type</span>
          <div className={f.dcToggle} style={{ height: 36 }}>
            <button type="button" className={`${f.dcBtn} ${direction === "receipt" ? f.onD : ""}`} onClick={() => { setDirection("receipt"); setParty(""); }}>Receipt (in)</button>
            <button type="button" className={`${f.dcBtn} ${direction === "payment" ? f.onC : ""}`} onClick={() => { setDirection("payment"); setParty(""); }}>Payment (out)</button>
          </div>
        </div>
        <label className={f.docField} style={{ marginBottom: 12 }}>
          <span className={f.docK}>{direction === "receipt" ? "Customer" : "Vendor"}</span>
          <select className={f.sel} value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">Select…</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.state}</option>)}
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label className={f.docField}><span className={f.docK}>Amount</span>
            <input className={`${f.inp} ${f.amt}`} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className={f.docField}><span className={f.docK}>Date</span>
            <input type="date" className={f.inp} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label className={f.docField}>
          <span className={f.docK}>Bank account (optional — defaults to 100100)</span>
          <select className={f.sel} value={bank} onChange={(e) => setBank(e.target.value)}>
            <option value="">Default</option>
            {bankOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </Drawer>
    </div>
  );
}
