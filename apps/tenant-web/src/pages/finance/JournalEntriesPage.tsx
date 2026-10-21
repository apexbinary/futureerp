import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, CheckCircle2, AlertTriangle, RotateCcw, Search, Link2 } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Tabs, SectionHeader, DataTable, type Column, useToast,
  fmtMoney, useAuth,
} from "@future-erp/ui-kit";
import { coApi, type CostCenter, type ProfitCenter } from "../../data/coApi";
import { useFinance } from "./useFinance";
import {
  SOURCE_LABEL,
  type CompanyCode, type GLAccount, type JournalEntry, type JournalLine,
  type DocStatus, type DocType, type DC, type SourceType,
} from "../../data/financeApi";
import page from "../page.module.css";
import f from "./finance.module.css";

const SOURCE_FILTERS: { value: SourceType | "all"; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "manual", label: "Manual entries" },
  { value: "ar_invoice", label: "Customer invoices" },
  { value: "ap_bill", label: "Vendor invoices" },
  { value: "ar_receipt", label: "Customer receipts" },
  { value: "ap_payment", label: "Vendor payments" },
  { value: "depreciation", label: "Depreciation" },
  { value: "reversal", label: "Reversals" },
];

const statusTone: Record<DocStatus, PillTone> = {
  draft: "neutral", posted: "success", reversed: "warning",
};
const money = (v: string | number) => fmtMoney(v);

// SAP document types (BKPF-BLART equivalents).
const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "SA", label: "SA · G/L account document" },
  { value: "KR", label: "KR · Vendor invoice" },
  { value: "DR", label: "DR · Customer invoice" },
  { value: "AB", label: "AB · General document" },
];
// Posting key preview for the chosen debit/credit indicator (G/L posting).
const pkFor = (dc: DC) => (dc === "D" ? "40" : "50");

type Draft = {
  gl_account: string; debit_credit: DC; amount: string;
  assignment: string; line_text: string;
  cost_center: string; profit_center: string;
  business_area: string; segment: string;
};
const emptyLine = (): Draft => ({
  gl_account: "", debit_credit: "D", amount: "",
  assignment: "", line_text: "", cost_center: "", profit_center: "",
  business_area: "", segment: "",
});
const today = () => new Date().toISOString().slice(0, 10);

export function JournalEntriesPage() {
  const api = useFinance();
  const { authFetch } = useAuth();
  const co = useMemo(() => coApi(authFetch), [authFetch]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [profitCenters, setProfitCenters] = useState<ProfitCenter[]>([]);
  const toast = useToast();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [companyCodes, setCompanyCodes] = useState<CompanyCode[]>([]);
  const [filter, setFilter] = useState<DocStatus | "all">("all");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");     // committed search term (server-side)
  const [loading, setLoading] = useState(true);

  // drawer: "new" (compose) | a JournalEntry (view) | null
  const [mode, setMode] = useState<"new" | JournalEntry | null>(null);

  // compose state (SAP document header)
  const [docType, setDocType] = useState<DocType>("SA");
  const [header, setHeader] = useState("");
  const [reference, setReference] = useState("");
  const [postingDate, setPostingDate] = useState(today());
  const [documentDate, setDocumentDate] = useState(today());
  const [lines, setLines] = useState<Draft[]>([emptyLine(), emptyLine()]);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api.journalEntries({
      source_type: source === "all" ? undefined : source,
      q: query || undefined,
    }).then(setEntries).catch((e) => toast(e.message));

  // Master data once.
  useEffect(() => {
    Promise.all([api.glAccounts(), api.companyCodes()])
      .then(([acc, cc]) => { setAccounts(acc); setCompanyCodes(cc); })
      .catch((e) => toast(e.message));
    co.costCenters.list().then(setCostCenters).catch(() => {});
    co.profitCenters.list().then(setProfitCenters).catch(() => {});
  }, [api, co]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entries refetch whenever the source filter or committed search changes.
  useEffect(() => {
    setLoading(true);
    api.journalEntries({
      source_type: source === "all" ? undefined : source,
      q: query || undefined,
    }).then(setEntries).catch((e) => toast(e.message)).finally(() => setLoading(false));
  }, [api, source, query]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDocType("SA"); setHeader(""); setReference("");
    setPostingDate(today()); setDocumentDate(today());
    setLines([emptyLine(), emptyLine()]); setMode("new");
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
        document_type: docType,
        posting_date: postingDate,
        document_date: documentDate,
        currency: companyCodes[0].currency,
        reference,
        header_text: header,
        lines: valid.map((l, i) => ({
          line_number: i + 1, gl_account: l.gl_account,
          debit_credit: l.debit_credit, amount: l.amount,
          assignment: l.assignment || "", line_text: l.line_text || "",
          cost_center: l.cost_center || null, profit_center: l.profit_center || null,
          business_area: l.business_area || "", segment: l.segment || "",
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
    { key: "document_number", header: "Document", mono: true, width: 120,
      render: (e) => <span className="mono" style={{ fontWeight: 600 }}>{e.document_number || "—"}</span> },
    { key: "source_type", header: "Source", width: 150,
      render: (e) => (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
          <span style={{ fontSize: 12 }}>{SOURCE_LABEL[e.source_type]}</span>
          {e.source_number && <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{e.source_number}</span>}
        </div>
      ) },
    { key: "party_name", header: "Business partner", width: 180, emphasis: "secondary",
      render: (e) => e.party_name
        ? <span>{e.party_name} <span className="mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>· {e.party_code}</span></span>
        : <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "posting_date", header: "Posting date", width: 110, emphasis: "secondary" },
    { key: "total_debit", header: "Amount", numeric: true, width: 120,
      render: (e) => <span className="tnum">{money(e.total_debit)}</span> },
    { key: "status", header: "Status", width: 100,
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <form
            onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
            style={{ position: "relative", display: "flex", alignItems: "center" }}
          >
            <Search size={14} style={{ position: "absolute", left: 9, color: "var(--text-faint)", pointerEvents: "none" }} />
            <input
              className={f.inp}
              style={{ width: 230, paddingLeft: 28 }}
              placeholder="Search document, party, reference…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value === "") setQuery(""); }}
            />
          </form>
          <select className={f.sel} style={{ width: 180 }} value={source} onChange={(e) => setSource(e.target.value as SourceType | "all")}>
            {SOURCE_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
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
        size="lg"
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
            <div className={f.docGrid}>
              <label className={f.docField}>
                <span className={f.docK}>Document type</span>
                <select className={f.inp} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
                  {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label className={f.docField}>
                <span className={f.docK}>Reference</span>
                <input className={f.inp} placeholder="External doc no." value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              <label className={f.docField}>
                <span className={f.docK}>Posting date</span>
                <input type="date" className={f.inp} value={postingDate} onChange={(e) => setPostingDate(e.target.value)} />
              </label>
              <label className={f.docField}>
                <span className={f.docK}>Document date</span>
                <input type="date" className={f.inp} value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
              </label>
            </div>
            <label className={f.docField} style={{ marginBottom: 16 }}>
              <span className={f.docK}>Header text</span>
              <input className={f.inp} placeholder="e.g. Office supplies paid by bank" value={header} onChange={(e) => setHeader(e.target.value)} />
            </label>

            {lines.map((l, i) => (
              <div className={f.jeLine} key={i}>
                <div className={f.jeLineTop}>
                  <span className={f.jeLineNo}>{i + 1}</span>
                  <select className={f.sel} value={l.gl_account} onChange={(e) => setLine(i, { gl_account: e.target.value })}>
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.account_number} · {a.name}</option>
                    ))}
                  </select>
                  <span className={f.pkBadge} title="Posting key (auto)">PK {pkFor(l.debit_credit)}</span>
                  <div className={f.dcToggle}>
                    <button type="button" className={`${f.dcBtn} ${l.debit_credit === "D" ? f.onD : ""}`} onClick={() => setLine(i, { debit_credit: "D" })}>D</button>
                    <button type="button" className={`${f.dcBtn} ${l.debit_credit === "C" ? f.onC : ""}`} onClick={() => setLine(i, { debit_credit: "C" })}>C</button>
                  </div>
                  <input className={`${f.inp} ${f.amt}`} inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                  <button type="button" className={f.delBtn} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label="Remove line">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className={f.jeLineDetail}>
                  <input className={f.inp} placeholder="Assignment" value={l.assignment} onChange={(e) => setLine(i, { assignment: e.target.value })} title="Assignment (Zuonr)" />
                  <input className={f.inp} placeholder="Line text" value={l.line_text} onChange={(e) => setLine(i, { line_text: e.target.value })} title="Item text" />
                  <select className={f.sel} value={l.cost_center} onChange={(e) => setLine(i, { cost_center: e.target.value })} title="Cost center">
                    <option value="">Cost ctr…</option>
                    {costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </select>
                  <select className={f.sel} value={l.profit_center} onChange={(e) => setLine(i, { profit_center: e.target.value })} title="Profit center">
                    <option value="">Profit ctr…</option>
                    {profitCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </select>
                  <input className={f.inp} placeholder="Business area" value={l.business_area} onChange={(e) => setLine(i, { business_area: e.target.value })} title="Business area" />
                  <input className={f.inp} placeholder="Segment" value={l.segment} onChange={(e) => setLine(i, { segment: e.target.value })} title="Segment" />
                </div>
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
    { key: "line_number", header: "#", width: 32, render: (l) => l.line_number },
    { key: "posting_key", header: "PK", width: 42, mono: true,
      render: (l) => <span className="mono" style={{ color: "var(--text-muted)" }}>{l.posting_key || "—"}</span> },
    { key: "account", header: "Account", mono: true, width: 92,
      render: (l) => <span className="mono">{l.account_number}</span> },
    { key: "account_name", header: "Name", emphasis: "secondary" },
    { key: "assignment", header: "Assignment", width: 100, emphasis: "secondary",
      render: (l) => l.assignment || "" },
    { key: "debit", header: "Debit", numeric: true, width: 100,
      render: (l) => (l.debit_credit === "D" ? <span className="tnum">{money(l.amount)}</span> : "") },
    { key: "credit", header: "Credit", numeric: true, width: 100,
      render: (l) => (l.debit_credit === "C" ? <span className="tnum">{money(l.amount)}</span> : "") },
  ];
  return (
    <>
      <div className={f.docMeta}>
        <div className={f.docField}><span className={f.docK}>Status</span>
          <span className={f.docV}><Pill tone={statusTone[entry.status]} dot>{entry.status}</Pill></span></div>
        <div className={f.docField}><span className={f.docK}>Document type</span><span className={f.docV}>{entry.document_type}</span></div>
        <div className={f.docField}><span className={f.docK}>Posting date</span><span className={f.docV}>{entry.posting_date}</span></div>
        <div className={f.docField}><span className={f.docK}>Document date</span><span className={f.docV}>{entry.document_date}</span></div>
        {entry.reference && (
          <div className={f.docField}><span className={f.docK}>Reference</span><span className={f.docV}>{entry.reference}</span></div>
        )}
        <div className={f.docField}><span className={f.docK}>Fiscal year</span><span className={f.docV}>{entry.fiscal_year ?? "—"}</span></div>
        <div className={f.docField} style={{ gridColumn: "1 / -1" }}>
          <span className={f.docK}>Header text</span><span className={f.docV}>{entry.header_text || "—"}</span></div>
      </div>

      {/* Document flow / linkage */}
      <div className={f.linkRow}>
        <span className={f.linkChip}><Link2 size={13} />{SOURCE_LABEL[entry.source_type]}</span>
        {entry.source_number && <span className={f.linkChip}>Source&nbsp;<b>{entry.source_number}</b></span>}
        {entry.party_name && (
          <span className={f.linkChip}>
            {entry.party_type === "vendor" ? "Vendor" : entry.party_type === "customer" ? "Customer" : "Partner"}&nbsp;
            <b>{entry.party_name}</b>&nbsp;<span className="mono" style={{ color: "var(--text-faint)" }}>{entry.party_code}</span>
          </span>
        )}
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
