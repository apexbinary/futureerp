import { useEffect, useMemo, useState } from "react";
import { Play, Check } from "lucide-react";
import { useAuth, Button, Drawer, Pill, SectionHeader, type Column, useToast, fmtMoney } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { useFinance } from "./useFinance";
import { aaApi, type FixedAsset } from "../../data/aaApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const monthEnd = () => {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

export function AssetsPage() {
  const { authFetch } = useAuth();
  const api = useMemo(() => aaApi(authFetch), [authFetch]);
  const finance = useFinance();
  const toast = useToast();
  const [companyCode, setCompanyCode] = useState("");
  const [runOpen, setRunOpen] = useState(false);
  const [period, setPeriod] = useState(monthEnd());
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { finance.companyCodes().then((c) => c[0] && setCompanyCode(c[0].id)).catch(() => {}); }, [finance]);

  const columns: Column<FixedAsset>[] = [
    { key: "code", header: "Code", mono: true, width: 90 },
    { key: "name", header: "Asset" },
    { key: "asset_class", header: "Class", width: 120, emphasis: "secondary",
      render: (a) => a.asset_class || <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "acquisition_cost", header: "Cost", numeric: true, width: 120, render: (a) => fmtMoney(a.acquisition_cost) },
    { key: "accumulated_depreciation", header: "Accum. dep.", numeric: true, width: 130, render: (a) => fmtMoney(a.accumulated_depreciation) },
    { key: "net_book_value", header: "Net book value", numeric: true, width: 140, render: (a) => <span style={{ fontWeight: 600 }}>{fmtMoney(a.net_book_value)}</span> },
    { key: "status", header: "Status", width: 100, render: (a) => (a.is_archived ? archPill(a) : <Pill tone={a.status === "active" ? "success" : "neutral"} dot>{a.status}</Pill>) },
  ];
  const fields: Field[] = [
    { key: "code", label: "Code", placeholder: "FA-002" },
    { key: "name", label: "Name", full: true },
    { key: "asset_class", label: "Asset class", placeholder: "Machinery" },
    { key: "acquisition_date", label: "Acquisition date", type: "date" },
    { key: "acquisition_cost", label: "Acquisition cost", type: "number" },
    { key: "salvage_value", label: "Salvage value", type: "number" },
    { key: "useful_life_years", label: "Useful life (years)", type: "number" },
  ];

  const runDep = async () => {
    setBusy(true);
    try {
      const r = await api.runDepreciation(period);
      toast(r.count ? `Depreciation ${r.period}: ${r.count} posted · ${fmtMoney(r.total_depreciation)}` : `No depreciation due for ${r.period} (${r.skipped} skipped)`);
      setRunOpen(false); setRefreshKey((k) => k + 1);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}><span>Finance</span><span className={page.sep}>›</span><span>Fixed Assets</span></div>
      <div className={page.head}>
        <div><h1>Fixed Assets</h1><p>Asset register · straight-line depreciation posts to the General Ledger</p></div>
        <div className={page.actions}><Button onClick={() => setRunOpen(true)}><Play size={15} />Run depreciation</Button></div>
      </div>
      <SectionHeader title="Asset register" />
      {companyCode && (
        <EntityManager<FixedAsset>
          key={refreshKey}
          title="Assets" singular="Asset"
          hint="Monthly straight-line depreciation = (cost − salvage) ÷ (useful life × 12). Run it from the button above."
          resource={api.assets} columns={columns} fields={fields}
          makeDefault={() => ({ company_code: companyCode, code: "", name: "", asset_class: "", acquisition_date: "", acquisition_cost: 0, salvage_value: 0, useful_life_years: 5 })}
        />
      )}

      <Drawer open={runOpen} onClose={() => setRunOpen(false)} title="Run depreciation" subtitle="Post one month's depreciation"
        footer={<Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={runDep}><Check size={16} />Run</Button>}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Posts straight-line depreciation for all active assets for the selected period. Re-running the same period is safe (already-depreciated assets are skipped).
        </p>
        <label className={f.docField}>
          <span className={f.docK}>Period (month-end date)</span>
          <input type="date" className={f.inp} value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
      </Drawer>
    </div>
  );
}
