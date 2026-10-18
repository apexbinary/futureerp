import { useMemo, useState } from "react";
import { Search, Download, Plus, Check } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Field, FieldGrid, useToast,
  DataTable, type Column, Tabs, SectionHeader,
} from "@future-erp/ui-kit";
import { invoices, money, type Invoice, type InvoiceStatus } from "../data/invoices";
import styles from "./page.module.css";

type Filter = "open" | "all" | "paid" | "overdue" | "draft";

const tone: Record<InvoiceStatus, PillTone> = {
  paid: "success", draft: "neutral", overdue: "danger", pending: "warning",
};
const label: Record<InvoiceStatus, string> = {
  paid: "Paid", draft: "Draft", overdue: "Overdue", pending: "Pending",
};

function keep(inv: Invoice, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "open") return inv.status !== "paid";
  return inv.status === f;
}

export function InvoicesPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Invoice | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (i) => keep(i, filter) && (!q || i.customer.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)),
    );
  }, [filter, query]);

  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  const count = (f: Filter) => invoices.filter((i) => keep(i, f)).length;
  const tabs = [
    { key: "open", label: "All open", count: count("open") },
    { key: "overdue", label: "Overdue", count: count("overdue") },
    { key: "draft", label: "Draft", count: count("draft") },
    { key: "paid", label: "Paid", count: count("paid") },
    { key: "all", label: "All", count: count("all") },
  ];

  const columns: Column<Invoice>[] = [
    { key: "id", header: "Invoice", mono: true, width: 130,
      render: (i) => <span className="mono" style={{ fontWeight: 600 }}>{i.id}</span> },
    { key: "customer", header: "Customer",
      render: (i) => (
        <div className={styles.cust}>
          <span className={styles.ini}>{i.ini}</span>
          {i.customer}
        </div>
      ) },
    { key: "issued", header: "Issued", emphasis: "secondary",
      render: (i) => <span className={styles.lastSeen}>{i.issued}</span> },
    { key: "amount", header: "Amount", numeric: true, width: 130,
      render: (i) => <span className={`${styles.amount} tnum`}>{money(i.amount)}</span> },
    { key: "status", header: "Status", width: 120,
      render: (i) => <Pill tone={tone[i.status]} dot>{label[i.status]}</Pill> },
  ];

  const totalRow = {
    __label: `${rows.length} invoices`,
    amount: <span className="tnum">{money(rows.reduce((s, i) => s + i.amount, 0))}</span>,
  };

  const openInvoice = (i: Invoice) => {
    setCurrent(i);
    setOpen(true);
  };

  const tax = current ? Math.round(current.amount * 0.075) : 0;
  const net = current ? current.amount - tax : 0;

  return (
    <div className={styles.inner}>
      <div className={styles.breadcrumb}>
        <span>Finance</span>
        <span className={styles.sep}>›</span>
        <span>Invoices</span>
      </div>

      <div className={styles.head}>
        <div>
          <h1>Invoices</h1>
          <p>Accounts receivable · {invoices.length} recent</p>
        </div>
        <div className={styles.actions}>
          <Button onClick={() => toast("Export started")}>
            <Download />
            Export
          </Button>
          <Button variant="primary" onClick={() => toast("New invoice draft created")}>
            <Plus />
            New invoice
          </Button>
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.label}>Outstanding</span>
          <span className={`${styles.value} tnum`}>{money(outstanding)}</span>
          <span className={styles.subtle}>{invoices.filter((i) => i.status !== "paid").length} open invoices</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Paid</span>
          <span className={`${styles.value} tnum`}>{money(paid)}</span>
          <span className={styles.subtle}>this period</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Overdue</span>
          <span className={`${styles.value} tnum`} style={{ color: overdue ? "var(--danger)" : undefined }}>
            {money(overdue)}
          </span>
          <span className={styles.subtle}>needs follow-up</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Avg. days to pay</span>
          <span className={`${styles.value} tnum`}>27.4</span>
          <span className={styles.subtle}>rolling 90 days</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as Filter)} />
        </div>
        <div className={styles.searchInline}>
          <Search size={15} />
          <input placeholder="Filter invoices…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <SectionHeader title="Receivables" right={`${rows.length} shown`} />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(i) => i.id}
        onRowClick={openInvoice}
        totalRow={totalRow}
        empty="No invoices match your filters."
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={current?.id ?? ""}
        subtitle={current?.customer}
        footer={
          current && (
            <>
              <Button
                variant="primary"
                style={{ flex: 1 }}
                onClick={() => {
                  toast(`${current.id} approved & sent`);
                  setOpen(false);
                }}
              >
                <Check size={16} />
                Approve &amp; send
              </Button>
              <Button onClick={() => toast("Payment recorded")}>Record payment</Button>
            </>
          )
        }
      >
        {current && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <Pill tone={tone[current.status]} dot>{label[current.status]}</Pill>
            </div>
            <FieldGrid>
              <Field label="Amount"><span className="mono tnum">{money(current.amount)}.00</span></Field>
              <Field label="Due date">{current.due}</Field>
              <Field label="Issued">{current.issued}</Field>
              <Field label="Terms">Net 30</Field>
            </FieldGrid>
            <div>
              <div
                style={{
                  fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".07em",
                  color: "var(--text-faint)", fontWeight: 700, marginBottom: 6,
                }}
              >
                Breakdown
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                <Row k="Subtotal" v={`${money(net)}.00`} />
                <Row k="Tax (7.5%)" v={`${money(tax)}.00`} />
                <Row k="Total" v={`${money(current.amount)}.00`} total />
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

function Row({ k, v, total }: { k: string; v: string; total?: boolean }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", padding: "9px 12px",
        borderBottom: total ? "0" : "1px solid var(--border)",
        background: total ? "var(--surface-inset)" : undefined,
        fontWeight: total ? 700 : 400, fontSize: 12.5,
      }}
    >
      <span>{k}</span>
      <span className="mono tnum">{v}</span>
    </div>
  );
}
