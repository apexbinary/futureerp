export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface CostCenter extends Archivable { id: string; code: string; name: string; manager: string; }
export interface CCReportRow { cost_center: string; code: string; name: string; amount: string; }
export interface CCReport { rows: CCReportRow[]; total: string; }

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
type ArchivedFilter = "false" | "true" | "all";

export function coApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    costCenters: {
      list: (archived: ArchivedFilter = "false") => authFetch(`/api/co/cost-centers/?archived=${archived}`).then(j<CostCenter[]>),
      create: (body: Partial<CostCenter>) => send("/api/co/cost-centers/", body).then(j<CostCenter>),
      update: (id: string, body: Partial<CostCenter>) => send(`/api/co/cost-centers/${id}/`, body, "PATCH").then(j<CostCenter>),
      archive: (id: string) => send(`/api/co/cost-centers/${id}/archive/`, {}).then(j<CostCenter>),
      unarchive: (id: string) => send(`/api/co/cost-centers/${id}/unarchive/`, {}).then(j<CostCenter>),
    },
    report: () => authFetch("/api/co/report/cost-centers/").then(j<CCReport>),
  };
}
