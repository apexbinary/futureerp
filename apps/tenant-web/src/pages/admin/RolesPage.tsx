import { useEffect, useState } from "react";
import { Plus, Users as UsersIcon, ShieldCheck, Trash2, Lock } from "lucide-react";
import { Button, Drawer, useToast } from "@future-erp/ui-kit";
import { useRbac } from "./useRbac";
import type { Role } from "../../data/rbacApi";
import s from "./admin.module.css";

export function RolesPage() {
  const api = useRbac();
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.roles().then(setRoles).catch(() => {});
  useEffect(() => { load(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createRole(name.trim(), desc.trim());
      toast(`Role “${name.trim()}” created`);
      setOpen(false); setName(""); setDesc("");
      load();
    } catch (e) {
      toast((e as Error).message);
    } finally { setBusy(false); }
  };

  const remove = async (r: Role) => {
    try { await api.deleteRole(r.id); toast(`Role “${r.name}” deleted`); load(); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Roles</span></div>
      <div className={s.head}>
        <div>
          <h1>Roles</h1>
          <p>Create roles and map their access in the permission matrix.</p>
        </div>
        <div className={s.actions}>
          <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> New role</Button>
        </div>
      </div>

      {roles.map((r) => (
        <div key={r.id} className={s.roleCard}>
          <div className={s.roleAvatar}><ShieldCheck size={20} /></div>
          <div>
            <div className={s.roleName}>
              {r.name}
              {r.is_system && <span className={s.sysNote}><Lock size={11} /> system</span>}
            </div>
            <div className={s.roleDesc}>{r.description || "No description"}</div>
          </div>
          <div className={s.roleMeta}>
            <span className={s.roleUsers}><UsersIcon size={13} style={{ verticalAlign: "-2px" }} /> {r.user_count}</span>
            {!r.is_system && (
              <Button variant="ghost" onClick={() => remove(r)} aria-label="Delete role"><Trash2 size={16} /></Button>
            )}
          </div>
        </div>
      ))}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New role"
        subtitle="Define a role, then set its access in the matrix."
        footer={
          <>
            <Button variant="primary" style={{ flex: 1 }} onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create role"}
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 650, color: "var(--text-muted)" }}>
          Role name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Finance Manager"
            autoFocus
            style={inp}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 650, color: "var(--text-muted)" }}>
          Description
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What can this role do?" style={inp} />
        </label>
      </Drawer>
    </div>
  );
}

const inp: React.CSSProperties = {
  height: 42, padding: "0 13px", borderRadius: 9, border: "1px solid var(--border-strong)",
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14,
};
