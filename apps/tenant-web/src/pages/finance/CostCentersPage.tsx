import { useEffect, useMemo, useState } from "react";
import { useAuth, DataTable, type Column, SectionHeader, useToast, fmtMoney } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { coApi, type CostCenter, type DimReportRow } from "../../data/coApi";
import page from "../page.module.css";

export function CostCentersPage() {
  const { authFetch } = useAuth();
  const api = useMemo(() => coApi(authFetch), [authFetch]);
  const toast = useToast();
  const [report, setReport] = useState<DimReportRow[]>([]);
  const [total, setTotal] = useState("0");

  useEffect(() => { api.costReport().then((r) => { setReport(r.rows); setTotal(r.total); }).catch((e) => toast(e.message)); }, [api]); // eslint-disable-line

  const columns: Column<CostCenter>[] = [
    { key: "code", header: "Code", mono: true, width: 110 },
    { key: "name", header: "Cost center" },
    { key: "manager", header: "Manager", emphasis: "secondary",
      render: (c) => c.manager || <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "status", header: "Status", width: 100, render: archPill },
  ];
  const fields: Field[] = [
    { key: "code", label: "Code", placeholder: "CC-400" },
    { key: "name", label: "Name", full: true },
    { key: "manager", label: "Manager", full: true },
  ];
  const repCols: Column<DimReportRow>[] = [
    { key: "code", header: "Code", mono: true, width: 110 },
    { key: "name", header: "Cost center" },
    { key: "amount", header: "Net spend", numeric: true, width: 160, render: (r) => fmtMoney(r.amount) },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Cost Centers</span></div>
      <div className={page.head}>
        <div><h1>Cost Centers</h1><p>Controlling · tag journal lines with a cost center to track where money is spent</p></div>
      </div>

      <SectionHeader title="Cost center master" />
      <EntityManager<CostCenter>
        title="Cost centers" singular="Cost center"
        hint="Create cost centers, then select them on journal entry lines. Spend rolls up in the report below."
        resource={api.costCenters} columns={columns} fields={fields}
        makeDefault={() => ({ code: "", name: "", manager: "" })}
      />

      <div style={{ height: 24 }} />
      <SectionHeader title="Spend by cost center" right={`Total ${fmtMoney(total)}`} />
      <DataTable columns={repCols} rows={report} getRowId={(r) => r.id}
        empty="No cost-center-tagged postings yet."
        totalRow={{ __label: "Total", amount: <span className="tnum">{fmtMoney(total)}</span> }} />
    </div>
  );
}
