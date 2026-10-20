import { useEffect, useState } from "react";
import { Tabs, SectionHeader, DataTable, type Column, useToast, fmtMoney } from "@future-erp/ui-kit";
import { useAr } from "./useAr";
import { useAp } from "./useAp";
import type { Aging, AgingRow } from "../../data/arApi";
import page from "../page.module.css";

type Side = "ar" | "ap";

export function AgingPage() {
  const ar = useAr();
  const ap = useAp();
  const toast = useToast();
  const [side, setSide] = useState<Side>("ar");
  const [arData, setArData] = useState<Aging | null>(null);
  const [apData, setApData] = useState<Aging | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([ar.aging(), ap.aging()])
      .then(([a, b]) => { setArData(a); setApData(b); })
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, [ar, ap]); // eslint-disable-line

  const data = side === "ar" ? arData : apData;
  const partyLabel = side === "ar" ? "Customer" : "Vendor";

  const columns: Column<AgingRow>[] = [
    { key: "party", header: partyLabel },
    { key: "current", header: "Current", numeric: true, width: 120, render: (r) => fmtMoney(r.current) },
    { key: "b1", header: "1–30", numeric: true, width: 110, render: (r) => fmtMoney(r.b1) },
    { key: "b2", header: "31–60", numeric: true, width: 110, render: (r) => fmtMoney(r.b2) },
    { key: "b3", header: "61–90", numeric: true, width: 110, render: (r) => fmtMoney(r.b3) },
    { key: "b4", header: "90+", numeric: true, width: 110,
      render: (r) => <span style={{ color: Number(r.b4) > 0 ? "var(--danger)" : undefined }}>{fmtMoney(r.b4)}</span> },
    { key: "total", header: "Total", numeric: true, width: 130, render: (r) => <span style={{ fontWeight: 600 }}>{fmtMoney(r.total)}</span> },
  ];

  const totalRow = data && {
    __label: "Total",
    current: <span className="tnum">{fmtMoney(data.totals.current)}</span>,
    b1: <span className="tnum">{fmtMoney(data.totals.b1)}</span>,
    b2: <span className="tnum">{fmtMoney(data.totals.b2)}</span>,
    b3: <span className="tnum">{fmtMoney(data.totals.b3)}</span>,
    b4: <span className="tnum">{fmtMoney(data.totals.b4)}</span>,
    total: <span className="tnum">{fmtMoney(data.totals.total)}</span>,
  };

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Aging</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Aging</h1>
          <p>Outstanding balances by age {data ? `· as of ${data.as_of}` : ""}</p>
        </div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs
            tabs={[{ key: "ar", label: "Receivables (A/R)" }, { key: "ap", label: "Payables (A/P)" }]}
            active={side}
            onChange={(k) => setSide(k as Side)}
          />
        </div>
      </div>

      <SectionHeader title={side === "ar" ? "A/R Aging" : "A/P Aging"} right={data ? `Total outstanding ${fmtMoney(data.totals.total)}` : ""} />
      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        getRowId={(r) => r.party_id}
        empty={loading ? "Loading…" : "Nothing outstanding — all settled."}
        totalRow={totalRow || undefined}
      />
    </div>
  );
}
