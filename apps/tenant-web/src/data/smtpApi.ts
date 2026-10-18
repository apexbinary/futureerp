export interface SmtpConfig {
  id: string; label: string; sender_name: string; sender_email: string;
  host: string; port: number; username: string; use_tls: boolean; use_ssl: boolean;
  send_limit: number | null; limit_period: "day" | "month" | "total"; is_active: boolean;
  usage: { used: number; limit: number | null; period: string }; created_at: string;
}
export interface EmailModule {
  id: string; key: string; name: string; description: string;
  default_smtp: string | null; smtp_label: string | null;
}
export interface SmtpLog {
  id: string; smtp_label: string; module_key: string; to_email: string;
  subject: string; status: "sent" | "failed" | "blocked"; error: string; created_at: string;
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function smtpApi(authFetch: Fetcher) {
  const send = (p: string, body: unknown, method = "POST") =>
    authFetch(p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return {
    configs: () => authFetch("/api/smtp/configs/").then(j<SmtpConfig[]>),
    createConfig: (data: Record<string, unknown>) => send("/api/smtp/configs/", data).then(j<SmtpConfig>),
    updateConfig: (id: string, data: Record<string, unknown>) => send(`/api/smtp/configs/${id}/`, data, "PATCH").then(j<SmtpConfig>),
    deleteConfig: (id: string) => authFetch(`/api/smtp/configs/${id}/`, { method: "DELETE" }),
    testConfig: (id: string, to_email: string) =>
      send(`/api/smtp/configs/${id}/test/`, { to_email }).then(async (r) => ({ ok: r.ok, ...(await r.json()) })),
    verifyConfig: (data: Record<string, unknown>) =>
      send("/api/smtp/configs/verify/", data).then(j<{ valid: boolean; error: string }>),
    modules: () => authFetch("/api/smtp/modules/").then(j<EmailModule[]>),
    bindModule: (id: string, default_smtp: string | null) =>
      send(`/api/smtp/modules/${id}/`, { default_smtp }, "PATCH").then(j<EmailModule>),
    logs: (params?: { module?: string; status?: string; from?: string; to?: string }) => {
      const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v));
      const q = new URLSearchParams(clean as Record<string, string>).toString();
      return authFetch(`/api/smtp/logs/${q ? "?" + q : ""}`).then(j<SmtpLog[]>);
    },
  };
}
