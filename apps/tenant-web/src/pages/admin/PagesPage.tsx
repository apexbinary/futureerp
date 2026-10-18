import { useEffect, useMemo, useState } from "react";
import { Lock, FileText } from "lucide-react";
import { useRbac } from "./useRbac";
import type { Page } from "../../data/rbacApi";
import s from "./admin.module.css";

export function PagesPage() {
  const api = useRbac();
  const [pages, setPages] = useState<Page[]>([]);

  useEffect(() => { api.pages().then(setPages).catch(() => {}); }, [api]);

  const byModule = useMemo(() => {
    const m: Record<string, Page[]> = {};
    pages.forEach((p) => { (m[p.module] ??= []).push(p); });
    return m;
  }, [pages]);

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Pages</span></div>
      <div className={s.head}>
        <div>
          <h1>Pages</h1>
          <p>Every screen and its sub-resources (tabs). System-defined.</p>
        </div>
        <div className={s.actions}><span className={s.sysNote}><Lock size={13} /> System-managed · read-only</span></div>
      </div>

      {Object.entries(byModule).map(([module, mp]) => (
        <div key={module} className={s.pageGroup}>
          <div className={s.moduleLabel}>{module}</div>
          {mp.map((p) => (
            <div key={p.id}>
              <div className={s.pageRow}>
                <FileText size={16} style={{ color: "var(--text-muted)" }} />
                <span className={s.pageName}>{p.name}</span>
                <span className={s.pageKey}>{p.key}</span>
              </div>
              {p.tabs.length > 0 && (
                <div className={s.tabs}>
                  {p.tabs.map((t) => <span key={t.id} className={s.tab}>{t.name}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
