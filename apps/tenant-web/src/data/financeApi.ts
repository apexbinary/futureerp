// Typed Finance API client. Uses authFetch from useAuth (Bearer + auto-refresh).

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type Statement = "balance_sheet" | "profit_loss";
export type DC = "D" | "C";
export type DocStatus = "draft" | "posted" | "reversed";
export type DocType = "SA" | "KR" | "DR" | "AB";
export type SourceType =
  | "manual" | "ar_invoice" | "ap_bill" | "ar_receipt" | "ap_payment" | "depreciation" | "reversal";
export type PartyType = "" | "customer" | "vendor" | "bank";

export const SOURCE_LABEL: Record<SourceType, string> = {
  manual: "Manual entry", ar_invoice: "Customer invoice", ap_bill: "Vendor invoice",
  ar_receipt: "Customer receipt", ap_payment: "Vendor payment",
  depreciation: "Depreciation", reversal: "Reversal",
};

export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }

export interface GLAccount extends Archivable {
  id: string;
  chart_of_accounts: string;
  chart_code: string;
  account_number: string;
  name: string;
  account_type: AccountType;
  statement: Statement;
  is_reconciliation: boolean;
  blocked: boolean;
}

export interface ChartOfAccounts extends Archivable {
  id: string;
  code: string;
  name: string;
  description: string;
  account_count: number;
}

export interface CompanyCode {
  id: string;
  code: string;
  name: string;
  currency: string;
  country: string;
  state?: string;
  gstin: string;
  chart_of_accounts: string;
  chart_code: string;
}

export interface PostingPeriod { id: string; period: number; start_date: string; end_date: string; is_open: boolean; }
export interface FiscalYear {
  id: string; company_code: string; company_code_code: string;
  year: number; start_date: string; end_date: string; is_closed: boolean; periods: PostingPeriod[];
}

export interface JournalLine {
  id?: string;
  line_number?: number;
  gl_account: string;
  account_number?: string;
  account_name?: string;
  debit_credit: DC;
  posting_key?: string;
  amount: string;
  line_text?: string;
  assignment?: string;
  cost_center?: string | null;
  cost_center_code?: string | null;
  cost_center_name?: string | null;
  profit_center?: string | null;
  profit_center_code?: string | null;
  profit_center_name?: string | null;
  business_area?: string;
  segment?: string;
}

export interface JournalEntry {
  id: string;
  company_code: string;
  company_code_code: string;
  document_number: string;
  fiscal_year: number | null;
  document_type: DocType;
  posting_date: string;
  document_date: string;
  currency: string;
  reference: string;
  header_text: string;
  status: DocStatus;
  reverses: string | null;
  source_type: SourceType;
  source_id: string | null;
  source_number: string;
  party_type: PartyType;
  party_code: string;
  party_name: string;
  total_debit: string;
  total_credit: string;
  is_balanced: boolean;
  lines: JournalLine[];
  created_at: string;
  posted_at: string | null;
}

export interface JournalFilter {
  status?: DocStatus;
  source_type?: SourceType;
  party_type?: Exclude<PartyType, "">;
  party_code?: string;
  document_type?: DocType;
  from?: string;
  to?: string;
  q?: string;
}

export interface NewJournalEntry {
  company_code: string;
  document_type: DocType;
  posting_date: string;
  document_date: string;
  currency?: string;
  reference?: string;
  header_text?: string;
  lines: JournalLine[];
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export interface TBRow { account_number: string; name: string; account_type: AccountType; debit: string; credit: string; }
export interface TrialBalance { rows: TBRow[]; total_debit: string; total_credit: string; balanced: boolean; }
export interface PLLine { account_number: string; name: string; amount: string; }
export interface ProfitLoss { revenue: PLLine[]; expense: PLLine[]; total_revenue: string; total_expense: string; net_profit: string; }
export interface BSLine { account_number: string; name: string; amount: string; }
export interface BalanceSheet {
  assets: BSLine[]; liabilities: BSLine[]; equity: BSLine[];
  total_assets: string; total_liabilities: string; total_equity: string;
  total_liabilities_equity: string; balanced: boolean;
}

type ArchivedFilter = "false" | "true" | "all";

export function financeApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const resource = <T>(base: string) => ({
    list: (archived: ArchivedFilter = "false") =>
      authFetch(`/api/finance/${base}/?archived=${archived}`).then(j<T[]>),
    create: (body: Partial<T>) => send(`/api/finance/${base}/`, body).then(j<T>),
    update: (id: string, body: Partial<T>) => send(`/api/finance/${base}/${id}/`, body, "PATCH").then(j<T>),
    archive: (id: string) => send(`/api/finance/${base}/${id}/archive/`, {}).then(j<T>),
    unarchive: (id: string) => send(`/api/finance/${base}/${id}/unarchive/`, {}).then(j<T>),
  });

  return {
    accounts: resource<GLAccount>("gl-accounts"),
    charts: resource<ChartOfAccounts>("charts-of-accounts"),
    companyCodes: () => authFetch("/api/finance/company-codes/").then(j<CompanyCode[]>),
    createCompanyCode: (body: Partial<CompanyCode>) => send("/api/finance/company-codes/", body).then(j<CompanyCode>),
    updateCompanyCode: (id: string, body: Partial<CompanyCode>) => send(`/api/finance/company-codes/${id}/`, body, "PATCH").then(j<CompanyCode>),
    fiscalYears: () => authFetch("/api/finance/fiscal-years/").then(j<FiscalYear[]>),
    createFiscalYear: (body: Partial<FiscalYear>) => send("/api/finance/fiscal-years/", body).then(j<FiscalYear>),
    glAccounts: () => authFetch("/api/finance/gl-accounts/").then(j<GLAccount[]>),
    journalEntries: (filter: JournalFilter = {}) => {
      const qs = new URLSearchParams(
        Object.entries(filter).filter(([, v]) => v != null && v !== "") as [string, string][],
      ).toString();
      return authFetch(`/api/finance/journal-entries/${qs ? `?${qs}` : ""}`).then(j<JournalEntry[]>);
    },
    getJournalEntry: (id: string) =>
      authFetch(`/api/finance/journal-entries/${id}/`).then(j<JournalEntry>),
    createJournalEntry: (body: NewJournalEntry) =>
      send("/api/finance/journal-entries/", body).then(j<JournalEntry>),
    postJournalEntry: (id: string) =>
      send(`/api/finance/journal-entries/${id}/post_document/`, {}).then(j<JournalEntry>),
    reverseJournalEntry: (id: string) =>
      send(`/api/finance/journal-entries/${id}/reverse/`, {}).then(j<JournalEntry>),

    trialBalance: (asOf?: string) =>
      authFetch(`/api/finance/reports/trial-balance/${asOf ? `?as_of=${asOf}` : ""}`).then(j<TrialBalance>),
    profitLoss: (asOf?: string) =>
      authFetch(`/api/finance/reports/profit-loss/${asOf ? `?as_of=${asOf}` : ""}`).then(j<ProfitLoss>),
    balanceSheet: (asOf?: string) =>
      authFetch(`/api/finance/reports/balance-sheet/${asOf ? `?as_of=${asOf}` : ""}`).then(j<BalanceSheet>),
  };
}
