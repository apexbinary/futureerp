import { useEffect, useState } from "react";
import { Waypoints } from "lucide-react";
import { useToast } from "@future-erp/ui-kit";
import { useSmtp } from "./useSmtp";
import type { EmailModule, SmtpConfig } from "../../data/smtpApi";
import s from "./admin.module.css";

export function EmailModulesPage() {
  const api = useSmtp();
  const toast = useToast();
  const [modules, setModules] = useState<EmailModule[]>([]);
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);

  const load = () => {
    api.modules().then(setModules).catch(() => {});
    api.configs().then(setConfigs).catch(() => {});
  };
  useEffect(() => { load(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const bind = async (m: EmailModule, smtpId: string) => {
    try {
      await api.bindModule(m.id, smtpId || null);
      toast(`${m.name} → ${smtpId ? configs.find((c) => c.id === smtpId)?.label : "unassigned"}`);
      load();
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Email modules</span></div>
      <div className={s.head}>
        <div>
          <h1>Email modules</h1>
          <p>Bind each email-sending feature to a default SMTP config. Modules are system-defined.</p>
        </div>
      </div>

      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>Module</th><th>Key</th><th>Default SMTP</th></tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Waypoints size={16} style={{ color: "var(--text-muted)" }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{m.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className={s.mono}>{m.key}</td>
                  <td>
                    <select
                      value={m.default_smtp ?? ""}
                      onChange={(e) => bind(m, e.target.value)}
                      style={{ height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 13, minWidth: 200 }}
                    >
                      <option value="">— Not configured —</option>
                      {configs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
