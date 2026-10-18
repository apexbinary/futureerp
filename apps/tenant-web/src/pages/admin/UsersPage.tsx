import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Pill, type PillTone, Drawer, useToast } from "@future-erp/ui-kit";
import { useRbac } from "./useRbac";
import { useSmtp } from "./useSmtp";
import type { RbacUser, Role } from "../../data/rbacApi";
import type { SmtpConfig } from "../../data/smtpApi";
import s from "./admin.module.css";

const statusTone: Record<string, PillTone> = { active: "success", invited: "warning", disabled: "danger" };

export function UsersPage() {
  const api = useRbac();
  const smtp = useSmtp();
  const toast = useToast();
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [smtpId, setSmtpId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = () => { api.users().then(setUsers).catch(() => {}); api.roles().then(setRoles).catch(() => {}); };
  useEffect(() => { load(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // load SMTP configs + default the invite sender to the module's bound config
  useEffect(() => {
    smtp.configs().then(setConfigs).catch(() => {});
    smtp.modules().then((m) => {
      const invite = m.find((x) => x.key === "identity.user_invite");
      if (invite?.default_smtp) setSmtpId(invite.default_smtp);
    }).catch(() => {});
  }, [smtp]);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await api.createUser(email.trim(), name.trim(), roleIds, smtpId || null);
      const inv = res.invite;
      if (inv?.sent) toast(`Invited ${email.trim()} — email sent ✓`);
      else if (inv?.status === "skipped") toast(`User added. No SMTP set for invites.`);
      else toast(`User added, but invite email failed: ${inv?.detail ?? inv?.status}`);
      setOpen(false); setEmail(""); setName(""); setRoleIds([]);
      load();
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggleRole = (id: string) =>
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Users</span></div>
      <div className={s.head}>
        <div>
          <h1>Users</h1>
          <p>People in your workspace and the roles assigned to them.</p>
        </div>
        <div className={s.actions}>
          <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> Add user</Button>
        </div>
      </div>

      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.full_name || "—"}{u.is_tenant_owner && " 👑"}</td>
                  <td className={s.mono}>{u.email}</td>
                  <td>{u.roles.map((r) => r.name).join(", ") || "—"}</td>
                  <td><Pill tone={statusTone[u.status] ?? "neutral"} dot>{u.status}</Pill></td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: "center", color: "var(--text-faint)" }}>No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add user"
        subtitle="Invite someone and assign their roles."
        footer={
          <>
            <Button variant="primary" style={{ flex: 1 }} onClick={invite} disabled={busy}>
              {busy ? "Inviting…" : "Send invite"}
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <label style={lbl}>Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" autoFocus style={inp} />
        </label>
        <label style={lbl}>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" style={inp} />
        </label>
        <div>
          <div style={{ ...lbl, marginBottom: 8 }}>Roles</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  border: "1px solid " + (roleIds.includes(r.id) ? "transparent" : "var(--border)"),
                  background: roleIds.includes(r.id) ? "var(--primary-soft)" : "var(--surface)",
                  color: roleIds.includes(r.id) ? "var(--primary)" : "var(--text-muted)",
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <label style={lbl}>Send invite via
          <select value={smtpId} onChange={(e) => setSmtpId(e.target.value)} style={inp}>
            <option value="">— No email (add silently) —</option>
            {configs.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.sender_email}</option>)}
          </select>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-faint)" }}>
            Defaults to the SMTP bound to “User invitation” in Email modules.
          </span>
        </label>
      </Drawer>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 650, color: "var(--text-muted)" };
const inp: React.CSSProperties = { height: 42, padding: "0 13px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14 };
