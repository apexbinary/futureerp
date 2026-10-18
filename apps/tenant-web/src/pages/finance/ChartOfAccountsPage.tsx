import { useEffect, useState } from "react";
import { type Column, Pill, SectionHeader } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { useFinance } from "./useFinance";
import type { GLAccount, ChartOfAccounts } from "../../data/financeApi";
import page from "../page.module.css";

const TYPE_OPTS = [
  { value: "asset", label: "Asset" }, { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" }, { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];
const STMT_OPTS = [
  { value: "balance_sheet", label: "Balance Sheet" }, { value: "profit_loss", label: "Profit & Loss" },
];

export function ChartOfAccountsPage() {
  const finance = useFinance();
  const [chart, setChart] = useState<ChartOfAccounts | null>(null);

  useEffect(() => { finance.charts.list().then((c) => setChart(c[0] ?? null)).catch(() => {}); }, [finance]);

  const columns: Column<GLAccount>[] = [
    { key: "account_number", header: "Account", mono: true, width: 110,
      render: (a) => <span className="mono" style={{ fontWeight: 600 }}>{a.account_number}</span> },
    { key: "name", header: "Name" },
    { key: "account_type", header: "Type", width: 100, render: (a) => <span style={{ textTransform: "capitalize" }}>{a.account_type}</span> },
    { key: "statement", header: "Statement", width: 130, emphasis: "secondary",
      render: (a) => (a.statement === "balance_sheet" ? "Balance Sheet" : "Profit & Loss") },
    { key: "is_reconciliation", header: "Recon.", align: "center", width: 80,
      render: (a) => (a.is_reconciliation ? <Pill tone="primary">Recon</Pill> : <span style={{ color: "var(--text-faint)" }}>—</span>) },
    { key: "status", header: "Status", width: 100, render: archPill },
  ];

  const fields: Field[] = [
    { key: "account_number", label: "Account number", placeholder: "e.g. 600000" },
    { key: "name", label: "Name", placeholder: "e.g. Marketing Expense" },
    { key: "account_type", label: "Type", type: "select", options: TYPE_OPTS },
    { key: "statement", label: "Statement", type: "select", options: STMT_OPTS },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Chart of Accounts</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Chart of Accounts</h1>
          <p>The master list of G/L accounts{chart ? ` · ${chart.code}` : ""}</p>
        </div>
      </div>
      <SectionHeader title="G/L Accounts" />
      {chart && (
        <EntityManager<GLAccount>
          title="Accounts" singular="Account"
          hint="Add, edit, and archive your general-ledger accounts. Seeded reconciliation accounts are protected."
          resource={finance.accounts}
          columns={columns}
          fields={fields}
          makeDefault={() => ({ chart_of_accounts: chart.id, account_number: "", name: "", account_type: "asset", statement: "balance_sheet" })}
        />
      )}
    </div>
  );
}
