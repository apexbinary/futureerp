import { useMemo } from "react";
import { useAuth } from "@future-erp/ui-kit";
import { apApi } from "../../data/apApi";

export function useAp() {
  const { authFetch } = useAuth();
  return useMemo(() => apApi(authFetch), [authFetch]);
}
