export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface FixedAsset extends Archivable {
  id: string; company_code: string; code: string; name: string; asset_class: string;
  acquisition_date: string; acquisition_cost: string; salvage_value: string; useful_life_years: number;
  status: "active" | "disposed";
  monthly_depreciation: string; accumulated_depreciation: string; net_book_value: string;
}
export interface DepRun { period: string; count: number; skipped: number; total_depreciation: string; posted: { asset: string; amount: string; document: string }[]; }

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
type ArchivedFilter = "false" | "true" | "all";

export function aaApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    assets: {
      list: (archived: ArchivedFilter = "false") => authFetch(`/api/aa/assets/?archived=${archived}`).then(j<FixedAsset[]>),
      create: (body: Partial<FixedAsset>) => send("/api/aa/assets/", body).then(j<FixedAsset>),
      update: (id: string, body: Partial<FixedAsset>) => send(`/api/aa/assets/${id}/`, body, "PATCH").then(j<FixedAsset>),
      archive: (id: string) => send(`/api/aa/assets/${id}/archive/`, {}).then(j<FixedAsset>),
      unarchive: (id: string) => send(`/api/aa/assets/${id}/unarchive/`, {}).then(j<FixedAsset>),
    },
    runDepreciation: (period_date: string) => send("/api/aa/run-depreciation/", { period_date }).then(j<DepRun>),
  };
}
