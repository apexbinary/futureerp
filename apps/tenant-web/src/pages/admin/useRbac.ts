import { useMemo } from "react";
import { useAuth } from "@future-erp/ui-kit";
import { rbacApi } from "../../data/rbacApi";

/** Memoized RBAC API bound to the current auth session. */
export function useRbac() {
  const { authFetch } = useAuth();
  return useMemo(() => rbacApi(authFetch), [authFetch]);
}
