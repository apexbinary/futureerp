export type InvoiceStatus = "paid" | "draft" | "overdue" | "pending";

export interface Invoice {
  id: string;
  customer: string;
  ini: string;
  issued: string;
  due: string;
  amount: number;
  status: InvoiceStatus;
}

export const invoices: Invoice[] = [
  { id: "INV-1042", customer: "ABC Corporation", ini: "AB", issued: "Sep 12, 2026", due: "Oct 12, 2026", amount: 12300, status: "pending" },
  { id: "INV-1041", customer: "Meridian Foods", ini: "MF", issued: "Sep 10, 2026", due: "Oct 10, 2026", amount: 8940, status: "paid" },
  { id: "INV-1040", customer: "Northwind Traders", ini: "NT", issued: "Sep 08, 2026", due: "Sep 18, 2026", amount: 21750, status: "overdue" },
  { id: "INV-1039", customer: "Volt Industries", ini: "VI", issued: "Sep 05, 2026", due: "Oct 05, 2026", amount: 4600, status: "draft" },
  { id: "INV-1038", customer: "Cedar & Co.", ini: "CC", issued: "Sep 03, 2026", due: "Oct 03, 2026", amount: 15230, status: "paid" },
  { id: "INV-1037", customer: "Halcyon Media", ini: "HM", issued: "Sep 01, 2026", due: "Sep 11, 2026", amount: 9870, status: "overdue" },
  { id: "INV-1036", customer: "Brightpath Labs", ini: "BL", issued: "Aug 29, 2026", due: "Sep 28, 2026", amount: 33400, status: "pending" },
  { id: "INV-1035", customer: "Quill Stationery", ini: "QS", issued: "Aug 27, 2026", due: "Sep 26, 2026", amount: 2180, status: "paid" },
];

import { fmtMoney } from "@future-erp/ui-kit";

export const money = (n: number) => fmtMoney(n);
