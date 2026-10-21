import { useEffect, useState } from "react";
import { type Column, SectionHeader } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { useAr } from "./useAr";
import { useFinance } from "./useFinance";
import type { Customer } from "../../data/arApi";
import page from "../page.module.css";

export function CustomersPage() {
  const ar = useAr();
  const finance = useFinance();
  const [acctOpts, setAcctOpts] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    finance.glAccounts()
      .then((a) => setAcctOpts(a.filter((x) => x.account_type === "asset").map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` }))))
      .catch(() => {});
  }, [finance]);

  const columns: Column<Customer>[] = [
    { key: "code", header: "Code", mono: true, width: 100 },
    { key: "name", header: "Customer" },
    { key: "state", header: "State (place of supply)", width: 180 },
    { key: "gstin", header: "GSTIN", mono: true, emphasis: "secondary",
      render: (c) => c.gstin || <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "status", header: "Status", width: 100, render: archPill },
  ];

  const fields: Field[] = [
    { key: "code", label: "Code", placeholder: "C-1004" },
    { key: "name", label: "Name", placeholder: "Acme Pvt. Ltd.", full: true },
    { key: "state", label: "State (place of supply)", placeholder: "Maharashtra" },
    { key: "gstin", label: "GSTIN", placeholder: "27AABCA1234A1Z5" },
    { key: "email", label: "Email", placeholder: "accounts@acme.example" },
    { key: "payment_terms", label: "Payment terms", placeholder: "e.g. Net 30" },
    { key: "receivable_account", label: "Receivable account (optional — defaults to 110000)", type: "select", options: acctOpts, full: true },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Customers</span>
      </div>
      <div className={page.head}>
        <div>
          <h1>Customers</h1>
          <p>Debtors · the state here drives the GST place-of-supply (intra vs inter)</p>
        </div>
      </div>
      <SectionHeader title="Customer master" />
      <EntityManager<Customer>
        title="Customers" singular="Customer"
        hint="The customer's state decides whether an invoice is intra-state (CGST+SGST) or inter-state (IGST)."
        resource={ar.customerCrud}
        columns={columns}
        fields={fields}
        makeDefault={() => ({ code: "", name: "", state: "", gstin: "", email: "", payment_terms: "", receivable_account: null })}
      />
    </div>
  );
}
