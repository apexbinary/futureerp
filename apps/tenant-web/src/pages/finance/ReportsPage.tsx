import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Tabs, SectionHeader, DataTable, type Column, fmtMoney, useToast,
} from "@future-erp/ui-kit";
import { useFinance } from "./useFinance";
import type { TrialBalance, ProfitLoss, BalanceSheet, TBRow, PLLine, BSLine } from "../../data/financeApi";
import page from "../page.module.css";
import r from "./reports.module.css";

type Report = "trial" | "pl" | "bs";
const today = () => new Date().toISOString().slice(0, 10);

export function ReportsPage() {
  const finance = useFinance();
  const toast = useToast();
  const [tab, setTab] = useState<Report>("trial");
  const [asOf, setAsOf] = useState(today());
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([finance.trialBalance(asOf), finance.profitLoss(asOf), finance.balanceSheet(asOf)])
      .then(([a, b, c]) => { setTb(a); setPl(b); setBs(c); })
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, [finance, asOf]); // eslint-disable-line

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Financial Reports</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Financial Reports</h1>
          <p>Live statements derived from the posted General Ledger</p>
        </div>
        <div className={page.actions}>
          <label className={r.asOf}>
            <span>As of</span>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
        </div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs
            tabs={[{ key: "trial", label: "Trial Balance" }, { key: "pl", label: "Profit & Loss" }, { key: "bs", label: "Balance Sheet" }]}
            active={tab}
            onChange={(k) => setTab(k as Report)}
          />
        </div>
      </div>

      {loading ? (
        <div className={r.empty}>Loading…</div>
      ) : tab === "trial" && tb ? (
        <TrialBalanceReport tb={tb} />
      ) : tab === "pl" && pl ? (
        <ProfitLossReport pl={pl} />
      ) : tab === "bs" && bs ? (
        <BalanceSheetReport bs={bs} />
      ) : null}
    </div>
  );
}

function Balanced({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className={`${r.balance} ${ok ? r.ok : r.bad}`}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      {label ?? (ok ? "In balance" : "Out of balance")}
    </span>
  );
}

/* ── Trial Balance ─────────────────────────────────────────── */
function TrialBalanceReport({ tb }: { tb: TrialBalance }) {
  const columns: Column<TBRow>[] = [
    { key: "account_number", header: "Account", mono: true, width: 110,
      render: (x) => <span className="mono" style={{ fontWeight: 600 }}>{x.account_number}</span> },
    { key: "name", header: "Name" },
    { key: "account_type", header: "Type", width: 100, emphasis: "secondary",
      render: (x) => <span style={{ textTransform: "capitalize" }}>{x.account_type}</span> },
    { key: "debit", header: "Debit", numeric: true, width: 140,
      render: (x) => (Number(x.debit) ? fmtMoney(x.debit) : <span style={{ color: "var(--text-faint)" }}>—</span>) },
    { key: "credit", header: "Credit", numeric: true, width: 140,
      render: (x) => (Number(x.credit) ? fmtMoney(x.credit) : <span style={{ color: "var(--text-faint)" }}>—</span>) },
  ];
  return (
    <>
      <SectionHeader title="Trial Balance" right={<Balanced ok={tb.balanced} />} />
      <DataTable
        columns={columns}
        rows={tb.rows}
        getRowId={(x) => x.account_number}
        empty="No posted entries yet."
        totalRow={{ __label: "Total", debit: <span className="tnum">{fmtMoney(tb.total_debit)}</span>, credit: <span className="tnum">{fmtMoney(tb.total_credit)}</span> }}
      />
    </>
  );
}

/* ── Profit & Loss ─────────────────────────────────────────── */
function ProfitLossReport({ pl }: { pl: ProfitLoss }) {
  const net = Number(pl.net_profit);
  return (
    <>
      <div className={r.kpis}>
        <Kpi label="Revenue" value={fmtMoney(pl.total_revenue)} />
        <Kpi label="Expenses" value={fmtMoney(pl.total_expense)} />
        <Kpi label="Net Profit" value={fmtMoney(pl.net_profit)} tone={net >= 0 ? "pos" : "neg"} />
      </div>
      <PLBlock title="Revenue" lines={pl.revenue} total={pl.total_revenue} />
      <PLBlock title="Expenses" lines={pl.expense} total={pl.total_expense} />
      <div className={r.netRow}>
        <span>Net Profit</span>
        <span className={`${r.netVal} ${net >= 0 ? r.pos : r.neg}`}>{fmtMoney(pl.net_profit)}</span>
      </div>
    </>
  );
}

function PLBlock({ title, lines, total }: { title: string; lines: PLLine[]; total: string }) {
  const columns: Column<PLLine>[] = [
    { key: "account_number", header: "Account", mono: true, width: 110 },
    { key: "name", header: title },
    { key: "amount", header: "Amount", numeric: true, width: 160, render: (x) => fmtMoney(x.amount) },
  ];
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionHeader title={title} />
      <DataTable columns={columns} rows={lines} getRowId={(x) => x.account_number}
        empty={`No ${title.toLowerCase()}.`}
        totalRow={{ __label: `Total ${title}`, amount: <span className="tnum">{fmtMoney(total)}</span> }} />
    </div>
  );
}

/* ── Balance Sheet ─────────────────────────────────────────── */
function BalanceSheetReport({ bs }: { bs: BalanceSheet }) {
  return (
    <>
      <SectionHeader title="Balance Sheet" right={<Balanced ok={bs.balanced} label={bs.balanced ? "Assets = Liabilities + Equity" : "Does not balance"} />} />
      <div className={r.bsGrid}>
        <BSBlock title="Assets" lines={bs.assets} total={bs.total_assets} />
        <div>
          <BSBlock title="Liabilities" lines={bs.liabilities} total={bs.total_liabilities} />
          <div style={{ height: 16 }} />
          <BSBlock title="Equity" lines={bs.equity} total={bs.total_equity} />
        </div>
      </div>
      <div className={r.bsFooter}>
        <div><span className={r.bsFootLabel}>Total Assets</span><span className={r.bsFootVal}>{fmtMoney(bs.total_assets)}</span></div>
        <div><span className={r.bsFootLabel}>Total Liabilities + Equity</span><span className={r.bsFootVal}>{fmtMoney(bs.total_liabilities_equity)}</span></div>
      </div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className={r.kpi}>
      <span className={r.kpiLabel}>{label}</span>
      <span className={`${r.kpiVal} ${tone === "pos" ? r.pos : tone === "neg" ? r.neg : ""}`}>{value}</span>
    </div>
  );
}

function BSBlock({ title, lines, total }: { title: string; lines: BSLine[]; total: string }) {
  const columns: Column<BSLine>[] = [
    { key: "name", header: title },
    { key: "amount", header: "", numeric: true, width: 150, render: (x) => fmtMoney(x.amount) },
  ];
  return (
    <DataTable columns={columns} rows={lines} getRowId={(x) => x.account_number + x.name}
      minWidth={280} empty={`No ${title.toLowerCase()}.`}
      totalRow={{ __label: `Total ${title}`, amount: <span className="tnum">{fmtMoney(total)}</span> }} />
  );
}

