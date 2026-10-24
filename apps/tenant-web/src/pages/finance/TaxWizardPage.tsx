import { useEffect, useState, type ReactNode } from "react";
import {
  Check, Plus, Pencil, Archive, ArchiveRestore, Save, Calculator,
} from "lucide-react";
import {
  Button, Drawer, DataTable, type Column, Tabs, SectionHeader, Pill, useToast, fmtMoney,
} from "@future-erp/ui-kit";
import { useTax } from "./useTax";
import { useFinance } from "./useFinance";
import type {
  TaxRegime, TaxLocation, TaxComponent, TaxSlab, TaxMatrix, MatrixEntry, TaxPreview, Archivable,
} from "../../data/taxApi";
import page from "../page.module.css";
import w from "./wizard.module.css";

const STEPS = ["Regime", "Locations", "Components", "Rate bands", "Mapping"];
const TABS: { key: string; label: string }[] = [
  { key: "locations", label: "Locations" },
  { key: "components", label: "Components" },
  { key: "slabs", label: "Rate bands" },
  { key: "mapping", label: "Mapping" },
];

export function TaxWizardPage() {
  const tax = useTax();
  const toast = useToast();
  const [regime, setRegime] = useState<TaxRegime | null>(null);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState(TABS[0].key);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tax.regimes.list()
      .then((rs) => setRegime(rs[0] ?? null))
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, [tax]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Tax Configuration</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Tax Configuration</h1>
          <p>
            {regime
              ? `${regime.name} · locations, components, rate bands, and the rate mapping.`
              : "Build your tax setup step by step — regime, locations, components, rate bands, and the rate mapping."}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-faint)", padding: 20 }}>Loading…</div>
      ) : !regime ? (
        // No regime yet — walk through the full 5-step wizard, starting with creating one.
        <div className={w.card}>
          <div className={w.stepper}>
            {STEPS.map((label, i) => (
              <button
                key={label}
                className={w.stepBtn}
                disabled={i > 0}
                onClick={() => i === 0 && setStep(0)}
              >
                <div className={`${w.step} ${i === step ? w.active : ""} ${i < step ? w.done : ""}`}>
                  {i < STEPS.length - 1 && <span className={w.stepLine} />}
                  <span className={w.stepDot}>{i < step ? <Check size={15} /> : i + 1}</span>
                  <span className={w.stepLabel}>{label}</span>
                </div>
              </button>
            ))}
          </div>
          <div className={w.body}>
            <RegimeStep regime={regime} onPick={setRegime} />
          </div>
        </div>
      ) : (
        // Regime already exists — normal tabbed management, no forced step-by-step flow.
        <div className={w.card}>
          <div className={w.mgrHead} style={{ padding: "14px 20px 0" }}>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
          </div>
          <div className={w.body}>
            {tab === "locations" ? <LocationsStep regime={regime} />
              : tab === "components" ? <ComponentsStep regime={regime} />
              : tab === "slabs" ? <SlabsStep regime={regime} />
              : <MappingStep regime={regime} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Step 1: Regime ─────────────────────────────────────────── */
function RegimeStep({ regime, onPick }: { regime: TaxRegime | null; onPick: (r: TaxRegime) => void }) {
  const tax = useTax();
  const toast = useToast();
  const [regimes, setRegimes] = useState<TaxRegime[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", country: "IN" });

  useEffect(() => { tax.regimes.list().then(setRegimes).catch((e) => toast(e.message)); }, [tax]); // eslint-disable-line

  const create = async () => {
    if (!form.code || !form.name) return toast("Code and name are required.");
    try {
      const r = await tax.regimes.create(form);
      setRegimes((rs) => [...rs, r]); onPick(r); setCreating(false);
      toast(`Regime "${r.name}" created`);
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <>
      <div className={w.stepHint}>A regime is the tax system (e.g. “India GST”). Pick one or create a new one.</div>
      <SectionHeader title="Regime" right={<Button onClick={() => setCreating(true)}><Plus size={15} />New regime</Button>} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {regimes.map((r) => (
          <button key={r.id} onClick={() => onPick(r)}
            style={{
              textAlign: "left", padding: "12px 14px", borderRadius: "var(--r-md)", cursor: "pointer",
              border: `1px solid ${regime?.id === r.id ? "var(--primary)" : "var(--border)"}`,
              background: regime?.id === r.id ? "var(--primary-soft)" : "var(--surface)", minWidth: 180,
            }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: regime?.id === r.id ? "var(--primary)" : "var(--text)" }}>{r.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>{r.code} · {r.country}</div>
          </button>
        ))}
        {!regimes.length && <div style={{ color: "var(--text-faint)" }}>No regimes yet — create one.</div>}
      </div>

      <Drawer open={creating} onClose={() => setCreating(false)} title="New regime" subtitle="Tax system"
        footer={<Button variant="primary" style={{ flex: 1 }} onClick={create}><Check size={16} />Create</Button>}>
        <div className={w.formGrid}>
          <div className={w.formField}><span className={w.fLabel}>Code</span>
            <input className={w.fInput} placeholder="IN_GST" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className={w.formField}><span className={w.fLabel}>Country</span>
            <input className={w.fInput} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div className={`${w.formField} ${w.full}`}><span className={w.fLabel}>Name</span>
            <input className={w.fInput} placeholder="India GST" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        </div>
      </Drawer>
    </>
  );
}

/* ── Generic entity manager (list + CRUD + archive) ─────────── */
type Field = { key: string; label: string; type?: "text" | "number" | "select"; options?: { value: string; label: string }[]; full?: boolean };

function EntityManager<T extends Archivable & { id: string; code?: string; name?: string }>({
  title, hint, resource, regimeId, columns, fields, makeDefault,
}: {
  title: string; hint: string;
  resource: { list: (r?: string, a?: "false" | "true" | "all") => Promise<T[]>; create: (b: Partial<T>) => Promise<T>; update: (id: string, b: Partial<T>) => Promise<T>; archive: (id: string) => Promise<T>; unarchive: (id: string) => Promise<T>; };
  regimeId: string;
  columns: Column<T>[];
  fields: Field[];
  makeDefault: () => Record<string, unknown>;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<T[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const load = () => resource.list(regimeId, showArchived ? "all" : "false").then(setRows).catch((e) => toast(e.message));
  useEffect(() => { load(); }, [regimeId, showArchived]); // eslint-disable-line

  const openNew = () => { setForm({ ...makeDefault(), regime: regimeId }); setEditing("new"); };
  const openEdit = (row: T) => { setForm({ ...row } as Record<string, unknown>); setEditing(row); };

  const save = async () => {
    try {
      if (editing === "new") { await resource.create(form as Partial<T>); toast(`${title} added`); }
      else if (editing) { await resource.update(editing.id, form as Partial<T>); toast(`${title} updated`); }
      setEditing(null); await load();
    } catch (e) { toast((e as Error).message); }
  };
  const doArchive = async (row: T) => { try { await resource.archive(row.id); toast("Archived"); await load(); } catch (e) { toast((e as Error).message); } };
  const doUnarchive = async (row: T) => { try { await resource.unarchive(row.id); toast("Unarchived"); await load(); } catch (e) { toast((e as Error).message); } };

  const actionCol: Column<T> = {
    key: "_actions", header: "", align: "right", width: 92,
    render: (row) => (
      <div className={w.rowActions}>
        {row.is_system && <span className={w.sysTag} title="System record">sys</span>}
        <button className={w.rowBtn} onClick={(e) => { e.stopPropagation(); openEdit(row); }} title="Edit"><Pencil size={14} /></button>
        {row.is_archived ? (
          <button className={w.rowBtn} onClick={(e) => { e.stopPropagation(); doUnarchive(row); }} title="Unarchive"><ArchiveRestore size={14} /></button>
        ) : (
          <button className={`${w.rowBtn} ${w.danger}`} disabled={row.is_system} onClick={(e) => { e.stopPropagation(); doArchive(row); }} title={row.is_system ? "System record (protected)" : "Archive"}><Archive size={14} /></button>
        )}
      </div>
    ),
  };

  return (
    <>
      <div className={w.stepHint}>{hint}</div>
      <div className={w.mgrHead}>
        <SectionHeader title={title} />
        <span className={w.spacer} />
        <button className={`${w.archToggle} ${showArchived ? w.on : ""}`} onClick={() => setShowArchived((s) => !s)}>
          <Archive size={13} />{showArchived ? "Showing archived" : "Show archived"}
        </button>
        <Button onClick={openNew}><Plus size={15} />Add</Button>
      </div>
      <DataTable
        columns={[...columns, actionCol]}
        rows={rows}
        getRowId={(r) => r.id}
        empty={`No ${title.toLowerCase()} yet.`}
      />

      <Drawer open={editing !== null} onClose={() => setEditing(null)}
        title={editing === "new" ? `Add ${title.toLowerCase().replace(/s$/, "")}` : "Edit"}
        subtitle={title}
        footer={<Button variant="primary" style={{ flex: 1 }} onClick={save}><Check size={16} />Save</Button>}>
        <div className={w.formGrid}>
          {fields.map((f) => (
            <div key={f.key} className={`${w.formField} ${f.full ? w.full : ""}`}>
              <span className={w.fLabel}>{f.label}</span>
              {f.type === "select" ? (
                <select className={w.fSelect} value={(form[f.key] as string) ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value || null })}>
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input className={w.fInput} type={f.type === "number" ? "number" : "text"}
                  value={(form[f.key] as string | number) ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}

const archPill = (a: Archivable): ReactNode =>
  a.is_archived ? <Pill tone="warning">Archived</Pill> : <Pill tone="success" dot>Active</Pill>;

/* ── Step 2: Locations ──────────────────────────────────────── */
function LocationsStep({ regime }: { regime: TaxRegime }) {
  const tax = useTax();
  const columns: Column<TaxLocation>[] = [
    { key: "code", header: "Code", mono: true, width: 120 },
    { key: "name", header: "Name" },
    { key: "status", header: "Status", width: 110, render: archPill },
  ];
  return (
    <EntityManager<TaxLocation>
      title="Locations" hint="Place-of-supply regions. Intra & Inter are built-in (system); add more if you need."
      resource={tax.locations} regimeId={regime.id} columns={columns}
      fields={[{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "sequence", label: "Order", type: "number" }]}
      makeDefault={() => ({ code: "", name: "", sequence: 0 })}
    />
  );
}

/* ── Step 3: Components ─────────────────────────────────────── */
function ComponentsStep({ regime }: { regime: TaxRegime }) {
  const tax = useTax();
  const finance = useFinance();
  const [accts, setAccts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    finance.glAccounts().then((a) => setAccts(a.map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` })))).catch(() => {});
  }, [finance]);
  const columns: Column<TaxComponent>[] = [
    { key: "code", header: "Code", mono: true, width: 100 },
    { key: "name", header: "Name" },
    { key: "status", header: "Status", width: 110, render: archPill },
  ];
  return (
    <EntityManager<TaxComponent>
      title="Components" hint="The atomic taxes (CGST, SGST, IGST…). Each posts to its own output/input G/L account."
      resource={tax.components} regimeId={regime.id} columns={columns}
      fields={[
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "output_account", label: "Output (sales) account", type: "select", options: accts, full: true },
        { key: "input_account", label: "Input (purchase) account", type: "select", options: accts, full: true },
        { key: "sequence", label: "Order", type: "number" },
      ]}
      makeDefault={() => ({ code: "", name: "", output_account: null, input_account: null, sequence: 0 })}
    />
  );
}

/* ── Step 4: Rate bands (slabs) ─────────────────────────────── */
function SlabsStep({ regime }: { regime: TaxRegime }) {
  const tax = useTax();
  const columns: Column<TaxSlab>[] = [
    { key: "code", header: "Code", mono: true, width: 100 },
    { key: "name", header: "Name" },
    { key: "total_rate", header: "Total %", numeric: true, width: 90, render: (s) => `${Number(s.total_rate)}%` },
    { key: "status", header: "Status", width: 110, render: archPill },
  ];
  return (
    <EntityManager<TaxSlab>
      title="Rate bands" hint="Named rate bands (GST 5/12/18/28…). A product’s HSN maps to one of these."
      resource={tax.slabs} regimeId={regime.id} columns={columns}
      fields={[
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "total_rate", label: "Total rate %", type: "number" }, { key: "sequence", label: "Order", type: "number" },
      ]}
      makeDefault={() => ({ code: "", name: "", total_rate: 0, sequence: 0 })}
    />
  );
}

/* ── Step 5: Mapping matrix + preview ───────────────────────── */
const cellKey = (slab: string, loc: string, comp: string) => `${slab}|${loc}|${comp}`;

function MappingStep({ regime }: { regime: TaxRegime }) {
  const tax = useTax();
  const toast = useToast();
  const [matrix, setMatrix] = useState<TaxMatrix | null>(null);
  const [loc, setLoc] = useState<string>("");
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = () => tax.matrix(regime.id).then((m) => { setMatrix(m); if (!loc && m.locations[0]) setLoc(m.locations[0].id); }).catch((e) => toast(e.message));
  useEffect(() => { load(); }, [regime.id]); // eslint-disable-line

  const valueOf = (slab: string, comp: string) => {
    const k = cellKey(slab, loc, comp);
    return k in edited ? edited[k] : matrix?.rates[k] ?? "";
  };
  const isDirty = (slab: string, comp: string) => cellKey(slab, loc, comp) in edited;
  const setCell = (slab: string, comp: string, v: string) => setEdited((e) => ({ ...e, [cellKey(slab, loc, comp)]: v }));
  const rowTotal = (slab: string) => (matrix?.components ?? []).reduce((s, c) => s + (Number(valueOf(slab, c.id)) || 0), 0);

  const save = async () => {
    if (!matrix) return;
    const entries: MatrixEntry[] = Object.entries(edited).map(([k, pct]) => {
      const [slab, location, component] = k.split("|");
      return { slab, location, component, percentage: pct === "" ? "0" : pct };
    });
    if (!entries.length) return toast("No changes to save.");
    setSaving(true);
    try { const fresh = await tax.saveMatrix(regime.id, entries); setMatrix(fresh); setEdited({}); toast(`Saved ${entries.length} rate(s)`); }
    catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  if (!matrix) return <div style={{ color: "var(--text-faint)" }}>Loading…</div>;
  const dirty = Object.keys(edited).length;

  return (
    <>
      <div className={w.stepHint}>For each rate band, enter how much each component contributes — per location. Totals should match the band’s rate.</div>
      <div className={w.mgrHead}>
        <Tabs tabs={matrix.locations.map((l) => ({ key: l.id, label: l.name }))} active={loc} onChange={setLoc} />
        <span className={w.spacer} />
        <Button variant="primary" disabled={saving || !dirty} onClick={save}><Save size={15} />Save{dirty ? ` (${dirty})` : ""}</Button>
      </div>

      <div className={w.card} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }} className="surfaceScroll">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={th}>Rate band</th>
                {matrix.components.map((c) => <th key={c.id} style={{ ...th, textAlign: "right" }}>{c.code} %</th>)}
                <th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.slabs.map((s) => {
                const total = rowTotal(s.id);
                const match = Math.abs(total - Number(s.total_rate)) < 0.001;
                return (
                  <tr key={s.id}>
                    <td style={td}><div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>target {s.total_rate}%</div></td>
                    {matrix.components.map((c) => (
                      <td key={c.id} style={{ ...td, textAlign: "right" }}>
                        <input inputMode="decimal" value={valueOf(s.id, c.id)} placeholder="0"
                          onChange={(e) => setCell(s.id, c.id, e.target.value)}
                          style={{
                            width: 72, height: 30, padding: "0 8px", textAlign: "right",
                            border: `1px solid ${isDirty(s.id, c.id) ? "var(--warning)" : "var(--border-strong)"}`,
                            background: isDirty(s.id, c.id) ? "var(--warning-soft)" : "var(--surface)",
                            color: "var(--text)", borderRadius: "var(--r-sm)",
                            fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: 12.5,
                          }} />
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: match ? "var(--success)" : "var(--danger)" }}>
                      {total.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MappingPreview regime={regime} slabs={matrix.slabs} />
    </>
  );
}

const th: React.CSSProperties = { textAlign: "left", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", padding: "9px 12px", background: "var(--surface-inset)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

function MappingPreview({ slabs }: { regime: TaxRegime; slabs: TaxSlab[] }) {
  const tax = useTax();
  const toast = useToast();
  const [slabId, setSlabId] = useState(slabs[0]?.id ?? "");
  const [supplier, setSupplier] = useState("Maharashtra");
  const [customer, setCustomer] = useState("Maharashtra");
  const [amount, setAmount] = useState("1000");
  const [result, setResult] = useState<TaxPreview | null>(null);

  useEffect(() => {
    if (!slabId) return;
    tax.preview(slabId, supplier, customer, amount).then(setResult).catch((e) => toast(e.message));
  }, [slabId, supplier, customer, amount]); // eslint-disable-line

  return (
    <div style={{ marginTop: 22 }}>
      <SectionHeader title="Live preview" right={<Pill tone="primary">auto-determined</Pill>} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <label className={w.formField}><span className={w.fLabel}>Rate band</span>
          <select className={w.fSelect} value={slabId} onChange={(e) => setSlabId(e.target.value)}>
            {slabs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className={w.formField}><span className={w.fLabel}>Supplier state</span>
          <input className={w.fInput} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></label>
        <label className={w.formField}><span className={w.fLabel}>Customer state</span>
          <input className={w.fInput} value={customer} onChange={(e) => setCustomer(e.target.value)} /></label>
        <label className={w.formField}><span className={w.fLabel}>Base amount</span>
          <input className={w.fInput} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      {result && (
        <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 6 }}>
          <Row k="Subtotal" v={fmtMoney(result.base_amount)} />
          {result.components.map((c) => <Row key={c.component} k={`${c.component} @ ${c.percentage}%`} v={fmtMoney(c.amount)} />)}
          <Row k={`Total (${result.region_type})`} v={fmtMoney(result.grand_total)} strong icon />
        </div>
      )}
    </div>
  );
}

function Row({ k, v, strong, icon }: { k: string; v: string; strong?: boolean; icon?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: strong ? 700 : 400,
      borderTop: strong ? "1px solid var(--border)" : undefined, paddingTop: strong ? 7 : 0 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{icon && <Calculator size={13} />}{k}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}
