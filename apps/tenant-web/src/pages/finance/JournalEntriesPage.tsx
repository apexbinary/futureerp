import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast,
  fmtMoney, useAuth,
} from "@future-erp/ui-kit";
import { coApi, type CostCenter } from "../../data/coApi";
import { useFinance } from "./useFinance";
import type {
  CompanyCode, GLAccount, JournalEntry, JournalLine, DocStatus, DC,
} from "../../data/financeApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const statusTone: Record<DocStatus, PillTone> = {
  draft: "neutral", posted: "success", reversed: "warning",
};
const money = (v: string | number) => fmtMoney(v);

type Draft = { gl_account: string; debit_credit: DC; amount: string; cost_center: string };
const emptyLine = (): Draft => ({ gl_account: "", debit_credit: "D", amount: "", cost_center: "" });
const today = () => new Date().toISOString().slice(0, 10);

export function JournalEntriesPage() {
  const api = useFinance();
  const { authFetch } = useAuth();
  const co = useMemo(() => coApi(authFetch), [authFetch]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const toast = useToast();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [companyCodes, setCompanyCodes] = useState<CompanyCode[]>([]);
  const [filter, setFilter] = useState<DocStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  // drawer: "new" (compose) | a JournalEntry (view) | null
  const [mode, setMode] = useState<"new" | JournalEntry | null>(null);

  // compose state
  const [header, setHeader] = useState("");
  const [postingDate, setPostingDate] = useState(today());
  const [lines, setLines] = useState<Draft[]>([emptyLine(), emptyLine()]);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api.journalEntries().then(setEntries).catch((e) => toast(e.message));

  useEffect(() => {
    Promise.all([api.journalEntries(), api.glAccounts(), api.companyCodes()])
      .then(([es, acc, cc]) => { setEntries(es); setAccounts(acc); setCompanyCodes(cc); })
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
    co.costCenters.list().then(setCostCenters).catch(() => {});
  }, [api, co]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.status === filter)),
    [entries, filter],
  );

  const tabs = [
    { key: "all", label: "All", count: entries.length },
    { key: "draft", label: "Drafts", count: entries.filter((e) => e.status === "draft").length },
    { key: "posted", label: "Posted", count: entries.filter((e) => e.status === "posted").length },
    { key: "reversed", label: "Reversed", count: entries.filter((e) => e.status === "reversed").length },
  ];

  const totalDebit = lines.reduce((s, l) => s + (l.debit_credit === "D" ? Number(l.amount) || 0 : 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.debit_credit === "C" ? Number(l.amount) || 0 : 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const openNew = () => {
    setHeader(""); setPostingDate(today()); setLines([emptyLine(), emptyLine()]); setMode("new");
  };

  const setLine = (i: number, patch: Partial<Draft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async (thenPost: boolean) => {
    if (!companyCodes[0]) return toast("No company code configured.");
    const valid = lines.filter((l) => l.gl_account && Number(l.amount) > 0);
    if (valid.length < 2) return toast("Add at least two lines with an account and amount.");
    setBusy(true);
    try {
      const doc = await api.createJournalEntry({
        company_code: companyCodes[0].id,
        document_type: "SA",
        posting_date: postingDate,
        document_date: postingDate,
        currency: companyCodes[0].currency,
        header_text: header,
        lines: valid.map((l, i) => ({
          line_number: i + 1, gl_account: l.gl_account,
          debit_credit: l.debit_credit, amount: l.amount, cost_center: l.cost_center || null,
        }) as JournalLine),
      });
      if (thenPost) {
        const posted = await api.postJournalEntry(doc.id);
        toast(`Posted · document ${posted.document_number}`);
      } else {
        toast("Draft saved");
      }
      setMode(null);
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const postExisting = async (e: JournalEntry) => {
    setBusy(true);
    try {
      const posted = await api.postJournalEntry(e.id);
      toast(`Posted · document ${posted.document_number}`);
      setMode(posted); await reload();
    } catch (err) { toast((err as Error).message); } finally { setBusy(false); }
  };

  const reverse = async (e: JournalEntry) => {
    setBusy(true);
    try {
      const rev = await api.reverseJournalEntry(e.id);
      toast(`Reversed · reversal document ${rev.document_number}`);
      setMode(null); await reload();
    } catch (err) { toast((err as Error).message); } finally { setBusy(false); }
  };

  const columns: Column<JournalEntry>[] = [
    { key: "document_number", header: "Document", mono: true, width: 130,
      render: (e) => <span className="mono" style={{ fontWeight: 600 }}>{e.document_number || "—"}</span> },
    { key: "header_text", header: "Description",
      render: (e) => e.header_text || <span style={{ color: "var(--text-faint)" }}>(no description)</span> },
    { key: "posting_date", header: "Posting date", width: 120, emphasis: "secondary" },
    { key: "total_debit", header: "Amount", numeric: true, width: 130,
      render: (e) => <span className="tnum">{money(e.total_debit)}</span> },
    { key: "status", header: "Status", width: 110,
      render: (e) => <Pill tone={statusTone[e.status]} dot>{e.status[0].toUpperCase() + e.status.slice(1)}</Pill> },
  ];

  const viewing = mode && mode !== "new" ? (mode as JournalEntry) : null;

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Journal Entries</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Journal Entries</h1>
          <p>General Ledger · every posting is a balanced document</p>
        </div>
        <div className={page.actions}>
          <Button variant="primary" onClick={openNew}><Plus />New entry</Button>
        </div>
      </div>

      <div className={page.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as DocStatus | "all")} />
        </div>
      </div>

      <SectionHeader title="Documents" right={loading ? "Loading…" : `${rows.length} shown`} />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        onRowClick={(e) => setMode(e)}
        empty={loading ? "Loading…" : "No journal entries yet."}
      />

      {/* Compose / view drawer */}
      <Drawer
        open={mode !== null}
        onClose={() => setMode(null)}
        title={viewing ? (viewing.document_number || "Draft document") : "New journal entry"}
        subtitle={viewing ? `${viewing.company_code_code} · ${viewing.document_type}` : "General Ledger posting"}
        footer={
          viewing ? (
            viewing.status === "draft" ? (
              <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => postExisting(viewing)}>
                <Check size={16} />Post document
              </Button>
            ) : viewing.status === "posted" ? (
              <Button style={{ flex: 1 }} disabled={busy} onClick={() => reverse(viewing)}>
                <RotateCcw size={16} />Reverse
              </Button>
            ) : (
              <span style={{ color: "var(--text-faint)", fontSize: 12 }}>This document has been reversed.</span>
            )
          ) : (
            <>
              <Button variant="primary" style={{ flex: 1 }} disabled={busy || !balanced} onClick={() => save(true)}>
                <Check size={16} />Post
              </Button>
              <Button disabled={busy} onClick={() => save(false)}>Save draft</Button>
            </>
          )
        }
      >
        {viewing ? (
          <DocumentView entry={viewing} />
        ) : (
          <>
            <label className={f.docField} style={{ marginBottom: 12 }}>
              <span className={f.docK}>Posting date</span>
              <input type="date" className={f.inp} value={postingDate} onChange={(e) => setPostingDate(e.target.value)} />
            </label>
            <label className={f.docField} style={{ marginBottom: 16 }}>
              <span className={f.docK}>Description</span>
              <input className={f.inp} placeholder="e.g. Office supplies paid by bank" value={header} onChange={(e) => setHeader(e.target.value)} />
            </label>

            <div className={f.lineHead}>
              <span>Account</span><span>D/C</span><span style={{ textAlign: "right" }}>Amount</span><span>Cost center</span><span />
            </div>
            {lines.map((l, i) => (
              <div className={f.lineRow} key={i}>
                <select className={f.sel} value={l.gl_account} onChange={(e) => setLine(i, { gl_account: e.target.value })}>
                  <option value="">Select…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_number} · {a.name}</option>
                  ))}
                </select>
                <div className={f.dcToggle}>
                  <button type="button" className={`${f.dcBtn} ${l.debit_credit === "D" ? f.onD : ""}`} onClick={() => setLine(i, { debit_credit: "D" })}>D</button>
                  <button type="button" className={`${f.dcBtn} ${l.debit_credit === "C" ? f.onC : ""}`} onClick={() => setLine(i, { debit_credit: "C" })}>C</button>
                </div>
                <input className={`${f.inp} ${f.amt}`} inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                <select className={f.sel} value={l.cost_center} onChange={(e) => setLine(i, { cost_center: e.target.value })}>
                  <option value="">—</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
                <button type="button" className={f.delBtn} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label="Remove line">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className={f.addLine} onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus size={14} />Add line
            </button>

            <div className={f.balance}>
              <div className={f.balItem}><span className={f.balLabel}>Total Debit</span><span className={f.balVal}>{money(totalDebit)}</span></div>
              <div className={f.balItem}><span className={f.balLabel}>Total Credit</span><span className={f.balVal}>{money(totalCredit)}</span></div>
              <span className={`${f.balStatus} ${balanced ? f.ok : f.bad}`}>
                {balanced ? <><CheckCircle2 size={15} />Balanced</> : <><AlertTriangle size={15} />Out by {money(Math.abs(totalDebit - totalCredit))}</>}
              </span>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

function DocumentView({ entry }: { entry: JournalEntry }) {
  const columns: Column<JournalLine>[] = [
    { key: "line_number", header: "#", width: 36, render: (l) => l.line_number },
    { key: "account", header: "Account", mono: true,
      render: (l) => <span className="mono">{l.account_number}</span> },
    { key: "account_name", header: "Name", emphasis: "secondary" },
    { key: "debit", header: "Debit", numeric: true, width: 110,
      render: (l) => (l.debit_credit === "D" ? <span className="tnum">{money(l.amount)}</span> : "") },
    { key: "credit", header: "Credit", numeric: true, width: 110,
      render: (l) => (l.debit_credit === "C" ? <span className="tnum">{money(l.amount)}</span> : "") },
  ];
  return (
    <>
      <div className={f.docMeta}>
        <div className={f.docField}><span className={f.docK}>Status</span>
          <span className={f.docV}><Pill tone={statusTone[entry.status]} dot>{entry.status}</Pill></span></div>
        <div className={f.docField}><span className={f.docK}>Document type</span><span className={f.docV}>{entry.document_type}</span></div>
        <div className={f.docField}><span className={f.docK}>Posting date</span><span className={f.docV}>{entry.posting_date}</span></div>
        <div className={f.docField}><span className={f.docK}>Fiscal year</span><span className={f.docV}>{entry.fiscal_year ?? "—"}</span></div>
        <div className={f.docField} style={{ gridColumn: "1 / -1" }}>
          <span className={f.docK}>Description</span><span className={f.docV}>{entry.header_text || "—"}</span></div>
      </div>
      <SectionHeader title="Line items" />
      <DataTable
        columns={columns}
        rows={entry.lines}
        getRowId={(l) => String(l.id ?? l.line_number)}
        totalRow={{ __label: "Total", debit: <span className="tnum">{money(entry.total_debit)}</span>, credit: <span className="tnum">{money(entry.total_credit)}</span> }}
      />
    </>
  );
}
