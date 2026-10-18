import { useMemo } from "react";
import { useAuth } from "@future-erp/ui-kit";
import { financeApi } from "../../data/financeApi";

/** Memoized Finance API bound to the current auth session. */
export function useFinance() {
  const { authFetch } = useAuth();
  return useMemo(() => financeApi(authFetch), [authFetch]);
}
