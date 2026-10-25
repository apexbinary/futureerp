// Typed Accounts Payable API client.

export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface Vendor extends Archivable { id: string; code: string; name: string; gstin: string; state: string; email: string; payment_terms: string; payable_account: string | null; }
export interface LineTax { id: string; component: string; component_code: string; percentage: string; amount: string; }
export interface BillLine {
  id?: string; line_number?: number; description?: string; expense_account: string | null;
  expense_account_number?: string | null; quantity: string; unit_price: string; tax_slab?: string | null;
  amount?: string; taxes?: LineTax[];
}
export type BillStatus = "draft" | "posted" | "cancelled";
export type Settlement = "unposted" | "open" | "partial" | "paid";
export interface VendorBill extends Archivable {
  id: string; company_code: string; vendor: string; vendor_name: string;
  bill_number: string; vendor_ref: string; bill_date: string;
  baseline_date: string | null; due_date: string | null; payment_terms: string;
  currency: string; notes: string; status: BillStatus;
  subtotal: string; tax_total: string; grand_total: string;
  paid_amount: string; outstanding: string; settlement_status: Settlement;
  journal_entry: string | null; journal_document: string | null;
  lines: BillLine[]; created_at: string; posted_at: string | null;
}

export interface AgingRow { party_id: string; party: string; current: string; b1: string; b2: string; b3: string; b4: string; total: string; }
export interface Aging { as_of: string; labels: Record<string, string>; rows: AgingRow[]; totals: Record<string, string>; currency_note?: string; }
export interface NewBill {
  company_code: string; vendor: string; bill_date: string; vendor_ref?: string;
  baseline_date?: string | null; due_date?: string | null;
  payment_terms?: string; notes?: string; currency?: string; lines: BillLine[];
}

export type DebitNoteStatus = "draft" | "posted" | "cancelled";
export interface DebitNote {
  id: string; company_code: string; vendor: string; vendor_name: string;
  bill: string; bill_number: string;
  debit_note_number: string; note_date: string; reason: string; currency: string;
  status: DebitNoteStatus; subtotal: string; tax_total: string; grand_total: string;
  journal_entry: string | null; journal_document: string | null;
  lines: BillLine[]; created_at: string; posted_at: string | null;
}
export interface NewDebitNote {
  bill: string; note_date: string; reason?: string; currency?: string; lines: BillLine[];
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
type ArchivedFilter = "false" | "true" | "all";

export function apApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const resource = <T>(base: string) => ({
    list: (archived: ArchivedFilter = "false") => authFetch(`/api/ap/${base}/?archived=${archived}`).then(j<T[]>),
    create: (body: Partial<T>) => send(`/api/ap/${base}/`, body).then(j<T>),
    update: (id: string, body: Partial<T>) => send(`/api/ap/${base}/${id}/`, body, "PATCH").then(j<T>),
    archive: (id: string) => send(`/api/ap/${base}/${id}/archive/`, {}).then(j<T>),
    unarchive: (id: string) => send(`/api/ap/${base}/${id}/unarchive/`, {}).then(j<T>),
  });

  return {
    vendorCrud: resource<Vendor>("vendors"),
    vendors: () => authFetch("/api/ap/vendors/").then(j<Vendor[]>),
    bills: (status?: BillStatus) => authFetch(`/api/ap/bills/${status ? `?status=${status}` : ""}`).then(j<VendorBill[]>),
    createBill: (body: NewBill) => send("/api/ap/bills/", body).then(j<VendorBill>),
    postBill: (id: string) => send(`/api/ap/bills/${id}/post_bill/`, {}).then(j<VendorBill>),
    reverseBill: (id: string) => send(`/api/ap/bills/${id}/reverse_bill/`, {}).then(j<VendorBill>),
    openItems: (vendor?: string) =>
      authFetch(`/api/ap/bills/open_items/${vendor ? `?vendor=${vendor}` : ""}`).then(j<VendorBill[]>),
    aging: () => authFetch("/api/ap/bills/aging/").then(j<Aging>),
    debitNotes: (status?: DebitNoteStatus) =>
      authFetch(`/api/ap/debit-notes/${status ? `?status=${status}` : ""}`).then(j<DebitNote[]>),
    createDebitNote: (body: NewDebitNote) => send("/api/ap/debit-notes/", body).then(j<DebitNote>),
    postDebitNote: (id: string) => send(`/api/ap/debit-notes/${id}/post_debit_note/`, {}).then(j<DebitNote>),
    reverseDebitNote: (id: string) => send(`/api/ap/debit-notes/${id}/reverse_debit_note/`, {}).then(j<DebitNote>),
  };
}
