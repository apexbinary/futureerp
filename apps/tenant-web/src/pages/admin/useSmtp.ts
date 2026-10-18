import { useMemo } from "react";
import { useAuth } from "@future-erp/ui-kit";
import { smtpApi } from "../../data/smtpApi";

export function useSmtp() {
  const { authFetch } = useAuth();
  return useMemo(() => smtpApi(authFetch), [authFetch]);
}
