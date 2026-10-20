export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface CostCenter extends Archivable { id: string; code: string; name: string; manager: string; }
export interface ProfitCenter extends Archivable { id: string; code: string; name: string; manager: string; }
export interface DimReportRow { id: string; code: string; name: string; amount: string; }
export interface DimReport { rows: DimReportRow[]; total: string; }

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
type ArchivedFilter = "false" | "true" | "all";

export function coApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const resource = <T>(base: string) => ({
    list: (archived: ArchivedFilter = "false") => authFetch(`/api/co/${base}/?archived=${archived}`).then(j<T[]>),
    create: (body: Partial<T>) => send(`/api/co/${base}/`, body).then(j<T>),
    update: (id: string, body: Partial<T>) => send(`/api/co/${base}/${id}/`, body, "PATCH").then(j<T>),
    archive: (id: string) => send(`/api/co/${base}/${id}/archive/`, {}).then(j<T>),
    unarchive: (id: string) => send(`/api/co/${base}/${id}/unarchive/`, {}).then(j<T>),
  });

  return {
    costCenters: resource<CostCenter>("cost-centers"),
    profitCenters: resource<ProfitCenter>("profit-centers"),
    costReport: () => authFetch("/api/co/report/cost-centers/").then(j<DimReport>),
    profitReport: () => authFetch("/api/co/report/profit-centers/").then(j<DimReport>),
  };
}
