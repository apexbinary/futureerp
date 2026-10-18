import { useMemo } from "react";
import { useAuth } from "@future-erp/ui-kit";
import { taxApi } from "../../data/taxApi";

export function useTax() {
  const { authFetch } = useAuth();
  return useMemo(() => taxApi(authFetch), [authFetch]);
}
