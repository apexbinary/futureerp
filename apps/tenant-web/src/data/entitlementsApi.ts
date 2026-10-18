import { useEffect, useState } from "react";
import { useAuth } from "@future-erp/ui-kit";

/** Fetches the tenant's licensed feature keys and exposes a `has(key)` check. */
export function useEntitlements() {
  const { authFetch } = useAuth();
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/entitlements/")
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((d: { keys: string[] }) => setKeys(new Set(d.keys)))
      .catch(() => setKeys(new Set()))
      .finally(() => setLoading(false));
  }, [authFetch]);

  return { keys, loading, has: (key?: string) => !key || keys.has(key) };
}
