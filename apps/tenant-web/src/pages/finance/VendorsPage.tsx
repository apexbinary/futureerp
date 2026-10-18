import { useEffect, useState } from "react";
import { type Column, SectionHeader } from "@future-erp/ui-kit";
import { EntityManager, archPill, type Field } from "../../components/EntityManager";
import { useAp } from "./useAp";
import { useFinance } from "./useFinance";
import type { Vendor } from "../../data/apApi";
import page from "../page.module.css";

export function VendorsPage() {
  const ap = useAp();
  const finance = useFinance();
  const [acctOpts, setAcctOpts] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    finance.glAccounts()
      .then((a) => setAcctOpts(a.filter((x) => x.account_type === "liability").map((x) => ({ value: x.id, label: `${x.account_number} · ${x.name}` }))))
      .catch(() => {});
  }, [finance]);

  const columns: Column<Vendor>[] = [
    { key: "code", header: "Code", mono: true, width: 100 },
    { key: "name", header: "Vendor" },
    { key: "state", header: "State (place of supply)", width: 180 },
    { key: "gstin", header: "GSTIN", mono: true, emphasis: "secondary",
      render: (v) => v.gstin || <span style={{ color: "var(--text-faint)" }}>—</span> },
    { key: "status", header: "Status", width: 100, render: archPill },
  ];
  const fields: Field[] = [
    { key: "code", label: "Code", placeholder: "V-2004" },
    { key: "name", label: "Name", placeholder: "Supplier Pvt. Ltd.", full: true },
    { key: "state", label: "State (place of supply)", placeholder: "Maharashtra" },
    { key: "gstin", label: "GSTIN", placeholder: "27AAFCM1111A1Z3" },
    { key: "email", label: "Email", full: true },
    { key: "payable_account", label: "Payable account (optional — defaults to 200000)", type: "select", options: acctOpts, full: true },
  ];

  return (
    <div className={page.inner}>
      <div className={page.breadcrumb}>
        <span>Finance</span><span className={page.sep}>›</span><span>Vendors</span>
      </div>
      <div className={page.head}>
        <div><h1>Vendors</h1><p>Creditors · the state here drives input-GST intra vs inter</p></div>
      </div>
      <SectionHeader title="Vendor master" />
      <EntityManager<Vendor>
        title="Vendors" singular="Vendor"
        hint="The vendor's state decides whether a bill is intra-state (CGST+SGST) or inter-state (IGST)."
        resource={ap.vendorCrud} columns={columns} fields={fields}
        makeDefault={() => ({ code: "", name: "", state: "", gstin: "", email: "", payable_account: null })}
      />
    </div>
  );
}
