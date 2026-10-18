// Typed RBAC API client. Uses the authFetch from useAuth (adds Bearer + auto-refresh).

export interface Permission { id: string; key: string; name: string; description: string; order: number; }
export interface Page { id: string; key: string; name: string; module: string; icon: string; order: number; is_active: boolean; tabs: Page[]; }
export interface Role { id: string; key: string; name: string; description: string; is_system: boolean; user_count: number; created_at: string; }
export interface RbacUser { id: string; email: string; full_name: string; status: string; is_tenant_owner: boolean; roles: { id: string; name: string }[]; }

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function rbacApi(authFetch: Fetcher) {
  const post = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return {
    permissions: () => authFetch("/api/rbac/permissions/").then(j<Permission[]>),
    pages: () => authFetch("/api/rbac/pages/").then(j<Page[]>),
    roles: () => authFetch("/api/rbac/roles/").then(j<Role[]>),
    createRole: (name: string, description: string) =>
      post("/api/rbac/roles/", { name, description }).then(j<Role>),
    deleteRole: (id: string) => authFetch(`/api/rbac/roles/${id}/`, { method: "DELETE" }),
    getMatrix: (roleId: string) =>
      authFetch(`/api/rbac/roles/${roleId}/matrix/`).then(j<{ role: string; allowed: [string, string][] }>),
    saveMatrix: (roleId: string, entries: { page: string; permission: string; allowed: boolean }[]) =>
      post(`/api/rbac/roles/${roleId}/matrix/`, { entries }, "PUT").then((r) => j(r)),
    users: () => authFetch("/api/rbac/users/").then(j<RbacUser[]>),
    createUser: (email: string, full_name: string, role_ids: string[], smtp_id?: string | null) =>
      post("/api/rbac/users/", { email, full_name, role_ids, smtp_id: smtp_id ?? null }).then(j<RbacUser & { invite?: { sent: boolean; status: string; detail: string } }>),
  };
}
