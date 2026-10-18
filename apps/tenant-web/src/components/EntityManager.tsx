import { useEffect, useState } from "react";
import { Plus, Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  Button, Drawer, DataTable, type Column, Pill, useToast,
} from "@future-erp/ui-kit";
import styles from "./entityManager.module.css";

export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export type ArchivedFilter = "false" | "true" | "all";

export interface CrudResource<T> {
  list: (archived: ArchivedFilter) => Promise<T[]>;
  create: (body: Partial<T>) => Promise<T>;
  update: (id: string, body: Partial<T>) => Promise<T>;
  archive: (id: string) => Promise<T>;
  unarchive: (id: string) => Promise<T>;
}

export type Field =
  | { key: string; label: string; type?: "text" | "number" | "date"; full?: boolean; placeholder?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; full?: boolean };

/** Reusable master-data manager: list + create/edit (drawer) + archive/unarchive + archived filter. */
export function EntityManager<T extends Archivable & { id: string }>({
  title, hint, singular, resource, columns, fields, makeDefault, extra,
}: {
  title: string;
  hint?: string;
  singular?: string;
  resource: CrudResource<T>;
  columns: Column<T>[];
  fields: Field[];
  makeDefault: () => Record<string, unknown>;
  /** extra content between the header and table (e.g. filter chips) */
  extra?: React.ReactNode;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<T[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const load = () =>
    resource.list(showArchived ? "all" : "false")
      .then(setRows).catch((e) => toast(e.message)).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); load(); }, [showArchived]); // eslint-disable-line

  const openNew = () => { setForm(makeDefault()); setEditing("new"); };
  const openEdit = (row: T) => { setForm({ ...row } as Record<string, unknown>); setEditing(row); };

  const save = async () => {
    try {
      if (editing === "new") { await resource.create(form as Partial<T>); toast(`${singular ?? title} added`); }
      else if (editing) { await resource.update(editing.id, form as Partial<T>); toast(`${singular ?? title} updated`); }
      setEditing(null); await load();
    } catch (e) { toast((e as Error).message); }
  };
  const doArchive = async (row: T) => { try { await resource.archive(row.id); toast("Archived"); await load(); } catch (e) { toast((e as Error).message); } };
  const doUnarchive = async (row: T) => { try { await resource.unarchive(row.id); toast("Unarchived"); await load(); } catch (e) { toast((e as Error).message); } };

  const actionCol: Column<T> = {
    key: "_actions", header: "", align: "right", width: 92,
    render: (row) => (
      <div className={styles.rowActions}>
        {row.is_system && <span className={styles.sysTag} title="System record">sys</span>}
        <button className={styles.rowBtn} onClick={(e) => { e.stopPropagation(); openEdit(row); }} title="Edit"><Pencil size={14} /></button>
        {row.is_archived ? (
          <button className={styles.rowBtn} onClick={(e) => { e.stopPropagation(); doUnarchive(row); }} title="Unarchive"><ArchiveRestore size={14} /></button>
        ) : (
          <button className={`${styles.rowBtn} ${styles.danger}`} disabled={row.is_system}
            onClick={(e) => { e.stopPropagation(); doArchive(row); }}
            title={row.is_system ? "System record (protected)" : "Archive"}><Archive size={14} /></button>
        )}
      </div>
    ),
  };

  return (
    <>
      {hint && <div className={styles.hint}>{hint}</div>}
      <div className={styles.head}>
        <span className={styles.spacer} />
        <button className={`${styles.archToggle} ${showArchived ? styles.on : ""}`} onClick={() => setShowArchived((s) => !s)}>
          <Archive size={13} />{showArchived ? "Showing archived" : "Show archived"}
        </button>
        <Button onClick={openNew}><Plus size={15} />Add {singular?.toLowerCase() ?? ""}</Button>
      </div>
      {extra}
      <DataTable columns={[...columns, actionCol]} rows={rows} getRowId={(r) => r.id}
        empty={loading ? "Loading…" : `No ${title.toLowerCase()} yet.`} />

      <Drawer open={editing !== null} onClose={() => setEditing(null)}
        title={editing === "new" ? `Add ${(singular ?? title).toLowerCase()}` : "Edit"} subtitle={title}
        footer={<Button variant="primary" style={{ flex: 1 }} onClick={save}>Save</Button>}>
        <div className={styles.formGrid}>
          {fields.map((f) => (
            <div key={f.key} className={`${styles.formField} ${f.full ? styles.full : ""}`}>
              <span className={styles.fLabel}>{f.label}</span>
              {f.type === "select" ? (
                <select className={styles.fSelect} value={(form[f.key] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value || null })}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input className={styles.fInput}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  placeholder={"placeholder" in f ? f.placeholder : undefined}
                  value={(form[f.key] as string | number) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}

export const archPill = (a: Archivable) =>
  a.is_archived ? <Pill tone="warning">Archived</Pill> : <Pill tone="success" dot>Active</Pill>;
