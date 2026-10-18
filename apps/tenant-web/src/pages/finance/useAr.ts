import { useMemo } from "react";
import { useAuth } from "@future-erp/ui-kit";
import { arApi } from "../../data/arApi";

export function useAr() {
  const { authFetch } = useAuth();
  return useMemo(() => arApi(authFetch), [authFetch]);
}
