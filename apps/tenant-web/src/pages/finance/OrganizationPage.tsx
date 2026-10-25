import { useEffect, useState } from "react";
import { Plus, Check } from "lucide-react";
import {
  Button, Drawer, DataTable, type Column, SectionHeader, Pill, useToast,
} from "@future-erp/ui-kit";
import { useFinance } from "./useFinance";
import type { CompanyCode, FiscalYear, ChartOfAccounts, ExchangeRate } from "../../data/financeApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const today = () => new Date().toISOString().slice(0, 10);

export function OrganizationPage() {
  const api = useFinance();
  const toast = useToast();
  const [codes, setCodes] = useState<CompanyCode[]>([]);
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [charts, setCharts] = useState<ChartOfAccounts[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [ccOpen, setCcOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revalAsOf, setRevalAsOf] = useState(today());
  const [revaluing, setRevaluing] = useState(false);

  const [cc, setCc] = useState({ code: "", name: "", currency: "INR", country: "IN", state: "", gstin: "", chart_of_accounts: "" });
  const [fy, setFy] = useState({ company_code: "", year: String(new Date().getFullYear()), start_date: "", end_date: "" });
  const [fx, setFx] = useState({ currency: "USD", rate_date: today(), rate_to_base: "" });

  const reload = () => Promise.all([api.companyCodes(), api.fiscalYears(), api.charts.list(), api.exchangeRates()])
    .then(([c, y, ch, fr]) => { setCodes(c); setYears(y); setCharts(ch); setRates(fr); if (ch[0]) setCc((s) => ({ ...s, chart_of_accounts: s.chart_of_accounts || ch[0].id })); })
    .catch((e) => toast(e.message));
  useEffect(() => { reload(); }, [api]); // eslint-disable-line

  const saveCc = async () => {
    if (!cc.code || !cc.name || !cc.chart_of_accounts) return toast("Code, name and chart are required.");
    setBusy(true);
    try { await api.createCompanyCode(cc); toast("Company code created"); setCcOpen(false); await reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const saveFy = async () => {
    if (!fy.company_code || !fy.year || !fy.start_date || !fy.end_date) return toast("All fields are required.");
    setBusy(true);
    try { await api.createFiscalYear({ ...fy, year: Number(fy.year) }); toast("Fiscal year created"); setFyOpen(false); await reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const saveFx = async () => {
    if (!fx.currency || !fx.rate_date || !Number(fx.rate_to_base)) return toast("Currency, date and rate are required.");
    setBusy(true);
    try { await api.createExchangeRate(fx); toast("Exchange rate saved"); setFxOpen(false); await reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const runRevaluation = async () => {
    setRevaluing(true);
    try {
      const r = await api.revalueFx(revalAsOf);
      if (!r.posted) {
        toast(r.reversed_prior ? `No open foreign-currency balances left — reversed ${r.reversed_prior} prior estimate.` : "No open foreign-currency balances to revalue.");
      } else {
        toast(`${r.document}: revalued ${r.items.length} open item(s)${r.reversed_prior ? ` (reversed ${r.reversed_prior} prior estimate)` : ""}.`);
      }
    } catch (e) { toast((e as Error).message); } finally { setRevaluing(false); }
  };

  const ccCols: Column<CompanyCode>[] = [
    { key: "code", header: "Code", mono: true, width: 90 },
    { key: "name", header: "Company code" },
    { key: "currency", header: "Currency", width: 90 },
    { key: "country", header: "Country", width: 90, emphasis: "secondary" },
    { key: "state", header: "State (supplier)", width: 160, render: (c) => c.state || <span style={{ color: "var(--text-faint)" }}>—</span> },
  ];
  const fyCols: Column<FiscalYear>[] = [
    { key: "company_code_code", header: "Company", mono: true, width: 100 },
    { key: "year", header: "Fiscal year", width: 110 },
    { key: "start_date", header: "From", width: 130, emphasis: "secondary" },
    { key: "end_date", header: "To", width: 130, emphasis: "secondary" },
    { key: "periods", header: "Periods", width: 90, render: (y) => `${y.periods.length}` },
    { key: "is_closed", header: "Status", width: 100, render: (y) => <Pill tone={y.is_closed ? "neutral" : "success"} dot>{y.is_closed ? "Closed" : "Open"}</Pill> },
  ];
  const baseCurrency = codes[0]?.currency || "INR";
  const fxCols: Column<ExchangeRate>[] = [
    { key: "currency", header: "Currency", mono: true, width: 100 },
    { key: "rate_date", header: "Effective from", width: 140, emphasis: "secondary" },
    { key: "rate_to_base", header: `Rate to ${baseCurrency}`, width: 140, render: (r) => `1 ${r.currency} = ${r.rate_to_base} ${baseCurrency}` },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Organization</span></div>
      <div className={page.head}>
        <div><h1>Organization</h1><p>Company codes (legal entities) and fiscal years — the foundation of posting</p></div>
      </div>

      <SectionHeader title="Company Codes" right={<Button onClick={() => setCcOpen(true)}><Plus size={15} />Add company code</Button>} />
      <DataTable columns={ccCols} rows={codes} getRowId={(c) => c.id} empty="No company codes." />

      <div style={{ height: 24 }} />
      <SectionHeader title="Fiscal Years" right={<Button onClick={() => setFyOpen(true)}><Plus size={15} />Add fiscal year</Button>} />
      <DataTable columns={fyCols} rows={years} getRowId={(y) => y.id} empty="No fiscal years." />

      <div style={{ height: 24 }} />
      <SectionHeader title="Exchange Rates" right={<Button onClick={() => setFxOpen(true)}><Plus size={15} />Add rate</Button>} />
      <DataTable columns={fxCols} rows={rates} getRowId={(r) => r.id}
        empty="No exchange rates — foreign-currency invoices/bills can't post until one exists." />

      <div style={{ height: 24 }} />
      <SectionHeader title="Period-End FX Revaluation"
        right={<span style={{ fontSize: 12, color: "var(--text-faint)" }}>Mark-to-market open foreign-currency balances</span>} />
      <div className={f.docGrid} style={{ alignItems: "end" }}>
        <label className={f.docField}>
          <span className={f.docK}>As of</span>
          <input type="date" className={f.inp} value={revalAsOf} onChange={(e) => setRevalAsOf(e.target.value)} />
        </label>
        <Button variant="primary" disabled={revaluing} onClick={runRevaluation}>
          {revaluing ? "Running…" : "Run revaluation"}
        </Button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8, marginBottom: 0 }}>
        Reverses whatever the last run posted, then re-estimates fresh from today's open invoices/bills and rates.
        Safe to re-run any time — it never affects the realized gain/loss booked when an item actually settles.
      </p>

      {/* Company code drawer */}
      <Drawer open={ccOpen} onClose={() => setCcOpen(false)} title="New company code" subtitle="Legal entity"
        footer={<Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={saveCc}><Check size={16} />Create</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Code"><input className={f.inp} placeholder="2000" value={cc.code} onChange={(e) => setCc({ ...cc, code: e.target.value })} /></Field>
          <Field label="Currency"><input className={f.inp} value={cc.currency} onChange={(e) => setCc({ ...cc, currency: e.target.value })} /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label="Name"><input className={f.inp} placeholder="ABC Corporation (South)" value={cc.name} onChange={(e) => setCc({ ...cc, name: e.target.value })} /></Field></div>
          <Field label="Country"><input className={f.inp} value={cc.country} onChange={(e) => setCc({ ...cc, country: e.target.value })} /></Field>
          <Field label="State (supplier)"><input className={f.inp} placeholder="Karnataka" value={cc.state} onChange={(e) => setCc({ ...cc, state: e.target.value })} /></Field>
          <Field label="GSTIN"><input className={f.inp} value={cc.gstin} onChange={(e) => setCc({ ...cc, gstin: e.target.value })} /></Field>
          <Field label="Chart of accounts">
            <select className={f.sel} value={cc.chart_of_accounts} onChange={(e) => setCc({ ...cc, chart_of_accounts: e.target.value })}>
              {charts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </Field>
        </div>
      </Drawer>

      {/* Fiscal year drawer */}
      <Drawer open={fyOpen} onClose={() => setFyOpen(false)} title="New fiscal year" subtitle="Posting periods"
        footer={<Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={saveFy}><Check size={16} />Create</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}><Field label="Company code">
            <select className={f.sel} value={fy.company_code} onChange={(e) => setFy({ ...fy, company_code: e.target.value })}>
              <option value="">Select…</option>
              {codes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </Field></div>
          <Field label="Year"><input className={f.inp} inputMode="numeric" value={fy.year} onChange={(e) => setFy({ ...fy, year: e.target.value })} /></Field>
          <div />
          <Field label="Start date"><input type="date" className={f.inp} value={fy.start_date} onChange={(e) => setFy({ ...fy, start_date: e.target.value })} /></Field>
          <Field label="End date"><input type="date" className={f.inp} value={fy.end_date} onChange={(e) => setFy({ ...fy, end_date: e.target.value })} /></Field>
        </div>
      </Drawer>

      {/* Exchange rate drawer */}
      <Drawer open={fxOpen} onClose={() => setFxOpen(false)} title="New exchange rate" subtitle={`To ${baseCurrency}`}
        footer={<Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={saveFx}><Check size={16} />Save</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Currency">
            <select className={f.sel} value={fx.currency} onChange={(e) => setFx({ ...fx, currency: e.target.value })}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </Field>
          <Field label="Effective from"><input type="date" className={f.inp} value={fx.rate_date} onChange={(e) => setFx({ ...fx, rate_date: e.target.value })} /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label={`1 ${fx.currency} = ? ${baseCurrency}`}>
              <input className={f.inp} inputMode="decimal" placeholder="e.g. 84.60" value={fx.rate_to_base} onChange={(e) => setFx({ ...fx, rate_to_base: e.target.value })} />
            </Field>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={f.docField}>
      <span className={f.docK}>{label}</span>
      {children}
    </label>
  );
}
