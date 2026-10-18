import { Fragment, useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { Button, Toggle, useToast } from "@future-erp/ui-kit";
import { useRbac } from "./useRbac";
import type { Page, Permission, Role } from "../../data/rbacApi";
import s from "./admin.module.css";

// flatten pages + tabs into ordered rows, keeping module + tab depth
interface Row { id: string; name: string; module: string; isTab: boolean; }

function flatten(pages: Page[]): Row[] {
  const rows: Row[] = [];
  for (const p of pages) {
    rows.push({ id: p.id, name: p.name, module: p.module, isTab: false });
    for (const t of p.tabs) rows.push({ id: t.id, name: t.name, module: p.module, isTab: true });
  }
  return rows;
}

const key = (page: string, perm: string) => `${page}::${perm}`;

export function MatrixPage() {
  const api = useRbac();
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [roleId, setRoleId] = useState<string>("");
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // load catalog
  useEffect(() => {
    Promise.all([api.roles(), api.permissions(), api.pages()])
      .then(([r, pm, pg]) => {
        setRoles(r); setPerms(pm); setRows(flatten(pg));
        if (r.length) setRoleId((cur) => cur || r[0].id);
      })
      .catch(() => {});
  }, [api]);

  // load matrix for selected role
  useEffect(() => {
    if (!roleId) return;
    api.getMatrix(roleId).then((m) => {
      const set = new Set(m.allowed.map(([p, pm]) => key(p, pm)));
      setAllowed(set);
      setBaseline(new Set(set));
    }).catch(() => {});
  }, [api, roleId]);

  const dirty = useMemo(() => {
    if (allowed.size !== baseline.size) return true;
    for (const k of allowed) if (!baseline.has(k)) return true;
    return false;
  }, [allowed, baseline]);

  const toggle = (pageId: string, permId: string) => {
    const k = key(pageId, permId);
    setAllowed((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const toggleColumn = (permId: string) => {
    const allOn = rows.every((r) => allowed.has(key(r.id, permId)));
    setAllowed((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => {
        const k = key(r.id, permId);
        allOn ? next.delete(k) : next.add(k);
      });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // diff against baseline -> only changed cells
      const entries: { page: string; permission: string; allowed: boolean }[] = [];
      const seen = new Set<string>();
      for (const r of rows) for (const p of perms) {
        const k = key(r.id, p.id);
        const now = allowed.has(k);
        const was = baseline.has(k);
        if (now !== was) { entries.push({ page: r.id, permission: p.id, allowed: now }); }
        seen.add(k);
      }
      await api.saveMatrix(roleId, entries);
      setBaseline(new Set(allowed));
      toast(`Saved ${entries.length} change${entries.length === 1 ? "" : "s"}`);
    } catch (e) { toast((e as Error).message); }
    finally { setSaving(false); }
  };

  // group rows by module for section headers
  const grouped = useMemo(() => {
    const out: { module: string; rows: Row[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.module === r.module) last.rows.push(r);
      else out.push({ module: r.module, rows: [r] });
    }
    return out;
  }, [rows]);

  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <div className={s.inner}>
      <div className={s.breadcrumb}><span>Admin</span><span className={s.sep}>›</span><span>Permission matrix</span></div>
      <div className={s.head}>
        <div>
          <h1>Permission matrix</h1>
          <p>Toggle what each role can do on every page &amp; tab.</p>
        </div>
        <div className={s.actions}>
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            <Save size={16} /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className={s.matrixBar}>
        <ShieldCheck size={18} style={{ color: "var(--primary)" }} />
        <select className={s.roleSelect} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {selectedRole?.is_system && <span className={s.sysNote}>system role</span>}
        {dirty && <span className={s.dirty}>● Unsaved changes</span>}
      </div>

      <div className={s.matrixWrap}>
        <div className={s.matrixScroll}>
          <table className={s.matrix}>
            <thead>
              <tr>
                <th className={s.pageCol}>Page / tab</th>
                {perms.map((p) => (
                  <th key={p.id}>
                    {p.name}
                    <span className={s.colAll} onClick={() => toggleColumn(p.id)}>toggle all</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <Fragment key={g.module}>
                  <tr className={s.moduleRow}>
                    <td colSpan={perms.length + 1}>{g.module}</td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={s.pageCell}>
                        <span className={`${s.pgName} ${r.isTab ? s.tab : ""}`}>
                          {r.isTab ? "↳ " : ""}{r.name}
                        </span>
                      </td>
                      {perms.map((p) => (
                        <td key={p.id}>
                          <span className={s.cellToggle}>
                            <Toggle
                              small
                              checked={allowed.has(key(r.id, p.id))}
                              onChange={() => toggle(r.id, p.id)}
                              ariaLabel={`${p.name} on ${r.name}`}
                            />
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
