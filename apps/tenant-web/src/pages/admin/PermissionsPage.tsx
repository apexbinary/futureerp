import { useEffect, useState } from "react";
import { Lock, Eye, PlusCircle, Pencil, Trash2, Download, Upload, Filter, CheckCircle2, type LucideIcon } from "lucide-react";
import { useRbac } from "./useRbac";
import type { Permission } from "../../data/rbacApi";
import s from "./admin.module.css";

const ICONS: Record<string, LucideIcon> = {
  read: Eye, write: PlusCircle, edit: Pencil, delete: Trash2,
  export: Download, import: Upload, filter: Filter, approve: CheckCircle2,
};

export function PermissionsPage() {
  const api = useRbac();
  const [perms, setPerms] = useState<Permission[]>([]);

  useEffect(() => { api.permissions().then(setPerms).catch(() => {}); }, [api]);

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Permissions</span></div>
      <div className={s.head}>
        <div>
          <h1>Permissions</h1>
          <p>The action catalog applied across every page. System-defined.</p>
        </div>
        <div className={s.actions}><span className={s.sysNote}><Lock size={13} /> System-managed · read-only</span></div>
      </div>

      <div className={s.grid}>
        {perms.map((p) => {
          const Icon = ICONS[p.key] ?? Eye;
          return (
            <div key={p.id} className={s.card}>
              <div className={s.cardIcon}><Icon size={18} /></div>
              <div className={s.cardTitle}>{p.name}</div>
              <div className={s.cardKey}>{p.key}</div>
              <div className={s.cardDesc}>{p.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
