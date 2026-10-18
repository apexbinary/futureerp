import { useEffect, useState } from "react";
import { type Column, SectionHeader, Pill, fmtMoney } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { useAr } from "./useAr";
import { useFinance } from "./useFinance";
import { useTax } from "./useTax";
import type { Item } from "../../data/arApi";
import page from "../page.module.css";

export function ItemsPage() {
  const ar = useAr();
  const finance = useFinance();
  const tax = useTax();
  const [slabOpts, setSlabOpts] = useState<{ value: string; label: string }[]>([]);
  const [acctOpts, setAcctOpts] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    // rate bands across all regimes (that's how the regime is chosen for an item)
    tax.regimes.list().then(async (regimes) => {
      const all = (await Promise.all(regimes.map((r) => tax.slabs.list(r.id)))).flat();
      setSlabOpts(all.map((s) => ({ value: s.id, label: s.name })));
    }).catch(() => {});
    finance.glAccounts()
      .then((a) => setAcctOpts(a.filter((x) => x.account_type === "revenue").map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` }))))
      .catch(() => {});
  }, [tax, finance]);

  const columns: Column<Item>[] = [
    { key: "code", header: "Code", mono: true, width: 110 },
    { key: "name", header: "Item" },
    { key: "hsn", header: "HSN", mono: true, width: 90, emphasis: "secondary",
      render: (i) => i.hsn || <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "unit_price", header: "Price", numeric: true, width: 120, render: (i) => fmtMoney(i.unit_price) },
    { key: "tax_slab_name", header: "Rate band", width: 120,
      render: (i) => (i.tax_slab_name ? <Pill tone="primary">{i.tax_slab_name}</Pill> : <span style={{ color: "var(--text-faint)" }}>none</span>) },
    { key: "status", header: "Status", width: 100, render: archPill },
  ];

  const fields: Field[] = [
    { key: "code", label: "Code", placeholder: "SKU-400" },
    { key: "name", label: "Name", placeholder: "Product name", full: true },
    { key: "hsn", label: "HSN / SAC", placeholder: "6302" },
    { key: "unit_price", label: "Unit price", type: "number" },
    { key: "tax_slab", label: "Rate band (sets the tax regime)", type: "select", options: slabOpts, full: true },
    { key: "revenue_account", label: "Revenue account (optional — defaults to 400000)", type: "select", options: acctOpts, full: true },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Items</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Items</h1>
          <p>Products &amp; services · the rate band here is what selects the tax regime on an invoice</p>
        </div>
      </div>
      <SectionHeader title="Item master" />
      <EntityManager<Item>
        title="Items" singular="Item"
        hint="Assign each item a rate band — that's where the tax regime & rate for its invoices comes from."
        resource={ar.itemCrud}
        columns={columns}
        fields={fields}
        makeDefault={() => ({ code: "", name: "", hsn: "", unit_price: 0, tax_slab: null, revenue_account: null })}
      />
    </div>
  );
}
