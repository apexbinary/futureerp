import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button, Pill, type PillTone, DateRangeFilter, type DateRange, useOptions,
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

      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>When</th><th>Recipient</th><th>Module</th><th>SMTP</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className={s.mono} style={{ whiteSpace: "nowrap" }}>{fmt(l.created_at)}</td>
                  <td>{l.to_email}</td>
                  <td className={s.mono}>{l.module_key || "—"}</td>
                  <td>{l.smtp_label || "—"}</td>
                  <td><Pill tone={tone[l.status] ?? "neutral"} dot>{l.status}</Pill></td>
                  <td style={{ maxWidth: 320, color: "var(--text-muted)", fontSize: 12 }}>{l.error || "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--text-faint)" }}>No log entries.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const ddl: React.CSSProperties = {
  height: 34, padding: "0 10px", borderRadius: 9, border: "1px solid var(--border-strong)",
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
};
