export type Direction = "receipt" | "payment";
export type PayStatus = "draft" | "posted" | "cancelled";
export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface Payment extends Archivable {
  id: string; company_code: string; direction: Direction;
  customer: string | null; vendor: string | null; party_name: string;
  payment_number: string; payment_date: string; amount: string; currency: string;
  bank_account: string | null; reference: string; notes: string;
  invoice: string | null; bill: string | null;
  status: PayStatus; journal_entry: string | null; journal_document: string | null;
  created_at: string; posted_at: string | null;
}
export interface Allocation { invoice?: string | null; bill?: string | null; amount: string; }
export interface NewPayment {
  company_code: string; direction: Direction; customer?: string | null; vendor?: string | null;
  payment_date: string; amount: string; bank_account?: string | null; reference?: string;
  invoice?: string | null; bill?: string | null; allocations?: Allocation[];
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function paymentsApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    list: (direction?: Direction) => authFetch(`/api/payments/${direction ? `?direction=${direction}` : ""}`).then(j<Payment[]>),
    create: (body: NewPayment) => send("/api/payments/", body).then(j<Payment>),
    post: (id: string) => send(`/api/payments/${id}/post_payment/`, {}).then(j<Payment>),
    reverse: (id: string) => send(`/api/payments/${id}/reverse_payment/`, {}).then(j<Payment>),
  };
}
