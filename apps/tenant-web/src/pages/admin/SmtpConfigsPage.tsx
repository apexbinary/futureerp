import { useEffect, useState } from "react";
import { Plus, Mail, Send, Trash2, ServerCog, PlugZap, CheckCircle2, XCircle } from "lucide-react";
import { Button, Pill, Drawer, Toggle, useToast, useOptions } from "@future-erp/ui-kit";
import { useSmtp } from "./useSmtp";
import type { SmtpConfig } from "../../data/smtpApi";
import s from "./admin.module.css";

const empty = {
  label: "", sender_name: "", sender_email: "", host: "", port: 587, username: "",
  password: "", use_tls: true, use_ssl: false, send_limit: "", limit_period: "day", is_active: true,
};

export function SmtpConfigsPage() {
  const api = useSmtp();
  const toast = useToast();
  const { options: periodOptions } = useOptions("smtp_limit_period");
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SmtpConfig | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...empty });
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<null | { ok: boolean; msg: string }>(null);

  const load = () => api.configs().then(setConfigs).catch(() => {});
  useEffect(() => { load(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditing(null); setForm({ ...empty }); setVerified(null); setOpen(true); };
  const openEdit = (c: SmtpConfig) => {
    setEditing(c);
    setForm({ ...c, password: "", send_limit: c.send_limit ?? "" });
    setVerified(null);
    setOpen(true);
  };
  const set = (k: string, v: unknown) => { setVerified(null); setForm((f) => ({ ...f, [k]: v })); };

  const verify = async () => {
    setVerifying(true);
    setVerified(null);
    try {
      const r = await api.verifyConfig({ ...form, id: editing?.id, port: Number(form.port) });
      setVerified({ ok: r.valid, msg: r.valid ? "Credentials verified — connection successful." : r.error });
    } catch (e) {
      setVerified({ ok: false, msg: (e as Error).message });
    } finally { setVerifying(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...form, port: Number(form.port), send_limit: form.send_limit === "" ? null : Number(form.send_limit) };
      if (editing) await api.updateConfig(editing.id, payload);
      else await api.createConfig(payload);
      toast(editing ? "SMTP config updated ✓" : "SMTP config created ✓");
      setOpen(false); load();
    } catch (e) {
      // backend rejects invalid creds on save — surface it and mark unverified
      const msg = (e as Error).message;
      setVerified({ ok: false, msg });
      toast(msg);
    }
    finally { setBusy(false); }
  };

  const remove = async (c: SmtpConfig) => {
    try { await api.deleteConfig(c.id); toast(`Deleted “${c.label}”`); load(); }
    catch (e) { toast((e as Error).message); }
  };

  const test = async (c: SmtpConfig) => {
    const to = prompt(`Send a test email from “${c.label}” to:`);
    if (!to) return;
    try {
      const r = await api.testConfig(c.id, to);
      toast(r.status === "sent" ? "Test email sent ✓" : `Test failed: ${r.error ?? r.status}`);
      load();
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>SMTP configs</span></div>
      <div className={s.head}>
        <div>
          <h1>SMTP configs</h1>
          <p>Mail accounts your workspace can send from. Bind them to modules and track usage.</p>
        </div>
        <div className={s.actions}><Button variant="primary" onClick={openNew}><Plus size={16} /> New SMTP</Button></div>
      </div>

      <div className={s.grid}>
        {configs.map((c) => {
          const pct = c.usage.limit ? Math.min(100, Math.round((c.usage.used / c.usage.limit) * 100)) : 0;
          return (
            <div key={c.id} className={s.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={s.cardIcon}><Mail size={18} /></div>
                {c.is_active ? <Pill tone="success" dot>Active</Pill> : <Pill tone="neutral" dot>Off</Pill>}
              </div>
              <div className={s.cardTitle}>{c.label}</div>
              <div className={s.cardKey}>{c.sender_name} · {c.sender_email}</div>
              <div className={s.cardDesc}>{c.host}:{c.port} · {c.use_ssl ? "SSL" : c.use_tls ? "TLS" : "none"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Usage: <b>{c.usage.used}</b>{c.usage.limit != null ? ` / ${c.usage.limit}` : " (no limit)"} <span style={{ color: "var(--text-faint)" }}>/{c.limit_period}</span>
                {c.usage.limit != null && (
                  <div style={{ height: 5, background: "var(--surface-2)", borderRadius: 5, marginTop: 5, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: pct > 85 ? "var(--danger)" : "var(--primary)" }} />
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Button onClick={() => openEdit(c)} style={{ height: 30, fontSize: 12 }}>Edit</Button>
                <Button onClick={() => test(c)} style={{ height: 30, fontSize: 12 }}><Send size={13} /> Test</Button>
                <Button variant="ghost" onClick={() => remove(c)} style={{ height: 30, marginLeft: "auto" }} aria-label="Delete"><Trash2 size={15} /></Button>
              </div>
            </div>
          );
        })}
        {configs.length === 0 && (
          <div style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: "var(--text-faint)" }}>
            <ServerCog size={28} /><div style={{ marginTop: 8 }}>No SMTP configs yet. Create one to start sending email.</div>
          </div>
        )}
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit SMTP config" : "New SMTP config"}
        subtitle="Credentials are stored securely and never shown again."
        footer={<>
          <Button onClick={verify} disabled={verifying} style={{ flex: 1 }}>
            <PlugZap size={15} /> {verifying ? "Testing…" : "Test connection"}
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </>}
      >
        {verified && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 9, marginBottom: 4,
            fontSize: 12.5, fontWeight: 600,
            background: verified.ok ? "var(--success-soft)" : "var(--danger-soft)",
            color: verified.ok ? "var(--success)" : "var(--danger)",
          }}>
            {verified.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <span style={{ minWidth: 0, wordBreak: "break-word" }}>{verified.msg}</span>
          </div>
        )}
        <F label="Label"><input style={inp} value={form.label as string} onChange={(e) => set("label", e.target.value)} placeholder="Primary Gmail" /></F>
        <div style={row2}>
          <F label="Sender name"><input style={inp} value={form.sender_name as string} onChange={(e) => set("sender_name", e.target.value)} placeholder="ABC Corp" /></F>
          <F label="Sender email"><input style={inp} value={form.sender_email as string} onChange={(e) => set("sender_email", e.target.value)} placeholder="noreply@abc.com" /></F>
        </div>
        <div style={row2}>
          <F label="Host"><input style={inp} value={form.host as string} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" /></F>
          <F label="Port"><input style={inp} type="number" value={form.port as number} onChange={(e) => set("port", e.target.value)} /></F>
        </div>
        <F label="Username"><input style={inp} value={form.username as string} onChange={(e) => set("username", e.target.value)} placeholder="noreply@abc.com" /></F>
        <F label={editing ? "Password (leave blank to keep)" : "Password"}><input style={inp} type="password" value={form.password as string} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" /></F>
        <div style={{ display: "flex", gap: 20, margin: "4px 0 18px" }}>
          <label style={sw}><Toggle small checked={form.use_tls as boolean} onChange={(v) => { set("use_tls", v); if (v) set("use_ssl", false); }} /> TLS</label>
          <label style={sw}><Toggle small checked={form.use_ssl as boolean} onChange={(v) => { set("use_ssl", v); if (v) set("use_tls", false); }} /> SSL</label>
          <label style={sw}><Toggle small checked={form.is_active as boolean} onChange={(v) => set("is_active", v)} /> Active</label>
        </div>
        <div style={row2}>
          <F label="Send limit (blank = unlimited)"><input style={inp} type="number" value={form.send_limit as string} onChange={(e) => set("send_limit", e.target.value)} placeholder="500" /></F>
          <F label="Limit period">
            <select style={inp} value={form.limit_period as string} onChange={(e) => set("limit_period", e.target.value)}>
              {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </F>
        </div>
      </Drawer>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 650, color: "var(--text-muted)", marginBottom: 16 }}>{label}{children}</label>;
}
const inp: React.CSSProperties = { height: 40, padding: "0 12px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 13.5, width: "100%" };
const row2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const sw: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", cursor: "pointer" };
