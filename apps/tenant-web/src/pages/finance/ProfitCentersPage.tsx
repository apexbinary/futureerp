import { useEffect, useMemo, useState } from "react";
import { useAuth, DataTable, type Column, SectionHeader, useToast, fmtMoney } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { coApi, type ProfitCenter, type DimReportRow } from "../../data/coApi";
import page from "../page.module.css";

export function ProfitCentersPage() {
  const { authFetch } = useAuth();
  const api = useMemo(() => coApi(authFetch), [authFetch]);
  const toast = useToast();
  const [report, setReport] = useState<DimReportRow[]>([]);
  const [total, setTotal] = useState("0");

  useEffect(() => { api.profitReport().then((r) => { setReport(r.rows); setTotal(r.total); }).catch((e) => toast(e.message)); }, [api]); // eslint-disable-line

  const columns: Column<ProfitCenter>[] = [
    { key: "code", header: "Code", mono: true, width: 110 },
    { key: "name", header: "Profit center" },
    { key: "manager", header: "Manager", emphasis: "secondary",
      render: (c) => c.manager || <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "status", header: "Status", width: 100, render: archPill },
  ];
  const fields: Field[] = [
    { key: "code", label: "Code", placeholder: "PC-300" },
    { key: "name", label: "Name", full: true },
    { key: "manager", label: "Manager", full: true },
  ];
  const repCols: Column<DimReportRow>[] = [
    { key: "code", header: "Code", mono: true, width: 110 },
    { key: "name", header: "Profit center" },
    { key: "amount", header: "Net", numeric: true, width: 160, render: (r) => fmtMoney(r.amount) },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Profit Centers</span></div>
      <div className={page.head}>
        <div><h1>Profit Centers</h1><p>Controlling · tag journal lines with a profit center to track where profit is earned</p></div>
      </div>

      <SectionHeader title="Profit center master" />
      <EntityManager<ProfitCenter>
        title="Profit centers" singular="Profit center"
        hint="Create profit centers, then select them on journal entry lines."
        resource={api.profitCenters} columns={columns} fields={fields}
        makeDefault={() => ({ code: "", name: "", manager: "" })}
      />

      <div style={{ height: 24 }} />
      <SectionHeader title="Net by profit center" right={`Total ${fmtMoney(total)}`} />
      <DataTable columns={repCols} rows={report} getRowId={(r) => r.id}
        empty="No profit-center-tagged postings yet."
        totalRow={{ __label: "Total", amount: <span className="tnum">{fmtMoney(total)}</span> }} />
    </div>
  );
}
