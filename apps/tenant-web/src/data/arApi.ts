// Typed Accounts Receivable API client.

export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface Customer extends Archivable { id: string; code: string; name: string; gstin: string; state: string; email: string; payment_terms: string; receivable_account: string | null; }
export interface Item extends Archivable { id: string; code: string; name: string; hsn: string; unit_price: string; tax_slab: string | null; tax_slab_name: string | null; revenue_account: string | null; }
export interface LineTax { id: string; component: string; component_code: string; percentage: string; amount: string; }
export interface InvoiceLine {
  id?: string; line_number?: number; item: string | null; item_name?: string | null;
  description?: string; quantity: string; unit_price: string; tax_slab?: string | null;
  amount?: string; taxes?: LineTax[];
}
export type InvoiceStatus = "draft" | "posted" | "cancelled";
export type Settlement = "unposted" | "open" | "partial" | "paid";
export interface CustomerInvoice {
  id: string; company_code: string; customer: string; customer_name: string;
  invoice_number: string; invoice_date: string; baseline_date: string | null;
  due_date: string | null; payment_terms: string;
  currency: string; notes: string; status: InvoiceStatus;
  subtotal: string; tax_total: string; grand_total: string;
  paid_amount: string; outstanding: string; settlement_status: Settlement;
  journal_entry: string | null; journal_document: string | null;
  lines: InvoiceLine[]; created_at: string; posted_at: string | null;
}

export interface AgingRow { party_id: string; party: string; current: string; b1: string; b2: string; b3: string; b4: string; total: string; }
export interface Aging { as_of: string; labels: Record<string, string>; rows: AgingRow[]; totals: Record<string, string>; currency_note?: string; }
export interface NewInvoice {
  company_code: string; customer: string; invoice_date: string;
  baseline_date?: string | null; due_date?: string | null;
  payment_terms?: string; notes?: string; currency?: string; lines: InvoiceLine[];
}

export type CreditNoteStatus = "draft" | "posted" | "cancelled";
export interface CreditNote {
  id: string; company_code: string; customer: string; customer_name: string;
  invoice: string; invoice_number: string;
  credit_note_number: string; note_date: string; reason: string; currency: string;
  status: CreditNoteStatus; subtotal: string; tax_total: string; grand_total: string;
  journal_entry: string | null; journal_document: string | null;
  lines: InvoiceLine[]; created_at: string; posted_at: string | null;
}
export interface NewCreditNote {
  invoice: string; note_date: string; reason?: string; currency?: string; lines: InvoiceLine[];
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

type ArchivedFilter = "false" | "true" | "all";

export function arApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const resource = <T>(base: string) => ({
    list: (archived: ArchivedFilter = "false") =>
      authFetch(`/api/ar/${base}/?archived=${archived}`).then(j<T[]>),
    create: (body: Partial<T>) => send(`/api/ar/${base}/`, body).then(j<T>),
    update: (id: string, body: Partial<T>) => send(`/api/ar/${base}/${id}/`, body, "PATCH").then(j<T>),
    archive: (id: string) => send(`/api/ar/${base}/${id}/archive/`, {}).then(j<T>),
    unarchive: (id: string) => send(`/api/ar/${base}/${id}/unarchive/`, {}).then(j<T>),
  });

  return {
    customerCrud: resource<Customer>("customers"),
    itemCrud: resource<Item>("items"),
    customers: () => authFetch("/api/ar/customers/").then(j<Customer[]>),
    items: () => authFetch("/api/ar/items/").then(j<Item[]>),
    invoices: (status?: InvoiceStatus) =>
      authFetch(`/api/ar/invoices/${status ? `?status=${status}` : ""}`).then(j<CustomerInvoice[]>),
    createInvoice: (body: NewInvoice) => send("/api/ar/invoices/", body).then(j<CustomerInvoice>),
    postInvoice: (id: string) => send(`/api/ar/invoices/${id}/post_invoice/`, {}).then(j<CustomerInvoice>),
    reverseInvoice: (id: string) => send(`/api/ar/invoices/${id}/reverse_invoice/`, {}).then(j<CustomerInvoice>),
    openItems: (customer?: string) =>
      authFetch(`/api/ar/invoices/open_items/${customer ? `?customer=${customer}` : ""}`).then(j<CustomerInvoice[]>),
    aging: () => authFetch("/api/ar/invoices/aging/").then(j<Aging>),
    creditNotes: (status?: CreditNoteStatus) =>
      authFetch(`/api/ar/credit-notes/${status ? `?status=${status}` : ""}`).then(j<CreditNote[]>),
    createCreditNote: (body: NewCreditNote) => send("/api/ar/credit-notes/", body).then(j<CreditNote>),
    postCreditNote: (id: string) => send(`/api/ar/credit-notes/${id}/post_credit_note/`, {}).then(j<CreditNote>),
    reverseCreditNote: (id: string) => send(`/api/ar/credit-notes/${id}/reverse_credit_note/`, {}).then(j<CreditNote>),
  };
}
