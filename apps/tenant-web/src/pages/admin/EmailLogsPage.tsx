import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button, Pill, type PillTone, DateRangeFilter, type DateRange, useOptions,
  DataTable, type Column,
} from "@future-erp/ui-kit";
import { useSmtp } from "./useSmtp";
import type { SmtpLog } from "../../data/smtpApi";
import s from "./admin.module.css";

const tone: Record<string, PillTone> = { sent: "success", failed: "danger", blocked: "warning" };

export function EmailLogsPage() {
  const api = useSmtp();
  const { options: statusOptions } = useOptions("smtp_log_status");
  const [logs, setLogs] = useState<SmtpLog[]>([]);
  const [status, setStatus] = useState("");           // "" = all
  const [range, setRange] = useState<DateRange | null>(null);

  const load = useCallback(() => {
    api.logs({ status, from: range?.from, to: range?.to }).then(setLogs).catch(() => {});
  }, [api, status, range]);
  useEffect(() => { load(); }, [load]);

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  const columns: Column<SmtpLog>[] = [
    { key: "created_at", header: "When", mono: true, width: 180, render: (l) => <span style={{ whiteSpace: "nowrap" }}>{fmt(l.created_at)}</span> },
    { key: "to_email", header: "Recipient" },
    { key: "module_key", header: "Module", mono: true, emphasis: "secondary", render: (l) => l.module_key || "—" },
    { key: "smtp_label", header: "SMTP", render: (l) => l.smtp_label || "—" },
    { key: "status", header: "Status", width: 110, render: (l) => <Pill tone={tone[l.status] ?? "neutral"} dot>{l.status}</Pill> },
    { key: "error", header: "Detail", render: (l) => <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{l.error || "—"}</span> },
  ];

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Email logs</span></div>
      <div className={s.head}>
        <div>
          <h1>Email logs</h1>
          <p>Every send attempt across your workspace — status, module, and errors.</p>
        </div>
        <div className={s.actions}><Button onClick={load}><RefreshCw size={15} /> Refresh</Button></div>
      </div>

      <div className={s.matrixBar}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={ddl}>
            <option value="">All statuses</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <DateRangeFilter value={range} onChange={setRange} />
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-faint)" }}>{logs.length} entries</span>
      </div>

      <DataTable columns={columns} rows={logs} getRowId={(l) => l.id} empty="No log entries." />
    </div>
  );
}

const ddl: React.CSSProperties = {
  height: 34, padding: "0 10px", borderRadius: 9, border: "1px solid var(--border-strong)",
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
};
