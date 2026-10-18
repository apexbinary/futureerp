import { createContext, useContext } from "react";
import type { ShellConfig } from "./types";

const ShellContext = createContext<ShellConfig | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellConfig {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <AppShell>");
  return ctx;
}
