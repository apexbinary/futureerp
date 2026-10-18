// Typed Tax Engine API client — full CRUD + Archive/Unarchive.

export interface Archivable { is_archived: boolean; archived_at: string | null; is_system: boolean; }
export interface TaxRegime extends Archivable { id: string; code: string; name: string; country: string; is_active: boolean; }
export interface TaxLocation extends Archivable { id: string; regime: string; code: string; name: string; sequence: number; }
export interface TaxComponent extends Archivable { id: string; regime: string; code: string; name: string; sequence: number; output_account: string | null; input_account: string | null; }
export interface TaxSlab extends Archivable { id: string; regime: string; code: string; name: string; total_rate: string; is_active: boolean; sequence: number; }
export interface TaxMatrix {
  regime: string;
  locations: TaxLocation[];
  components: TaxComponent[];
  slabs: TaxSlab[];
  rates: Record<string, string>; // "slab|location|component" -> percentage
}
export interface MatrixEntry { slab: string; location: string; component: string; percentage: string; }
export interface TaxPreview {
  slab: string; region_type: string; base_amount: string;
  components: { component: string; percentage: string; amount: string }[];
  total_tax: string; grand_total: string;
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

type ArchivedFilter = "false" | "true" | "all";

export function taxApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  // generic CRUD + archive factory for a config resource
  const resource = <T>(base: string) => ({
    list: (regimeId?: string, archived: ArchivedFilter = "false") => {
      const q = new URLSearchParams();
      if (regimeId) q.set("regime", regimeId);
      q.set("archived", archived);
      return authFetch(`/api/tax/${base}/?${q}`).then(j<T[]>);
    },
    create: (body: Partial<T>) => send(`/api/tax/${base}/`, body).then(j<T>),
    update: (id: string, body: Partial<T>) => send(`/api/tax/${base}/${id}/`, body, "PATCH").then(j<T>),
    archive: (id: string) => send(`/api/tax/${base}/${id}/archive/`, {}).then(j<T>),
    unarchive: (id: string) => send(`/api/tax/${base}/${id}/unarchive/`, {}).then(j<T>),
  });

  return {
    regimes: resource<TaxRegime>("regimes"),
    locations: resource<TaxLocation>("locations"),
    components: resource<TaxComponent>("components"),
    slabs: resource<TaxSlab>("slabs"),

    matrix: (regimeId: string) => authFetch(`/api/tax/regimes/${regimeId}/matrix/`).then(j<TaxMatrix>),
    saveMatrix: (regimeId: string, entries: MatrixEntry[]) =>
      send(`/api/tax/regimes/${regimeId}/matrix/`, { entries }, "PUT").then(j<TaxMatrix>),
    preview: (slab: string, supplier_state: string, customer_state: string, base_amount: string) =>
      send("/api/tax/preview/", { slab, supplier_state, customer_state, base_amount }).then(j<TaxPreview>),
  };
}
