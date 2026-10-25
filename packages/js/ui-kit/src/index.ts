// Formatting
export { fmtAmount, fmtMoney, fmtCount, currencySymbol } from "./format";

// Providers
export { ThemeProvider, useTheme } from "./theme";
export { ToastProvider, useToast } from "./toast";
export { AuthProvider, useAuth, type AuthUser } from "./auth";
export { useOptions, type Option } from "./useOptions";

// Components
export { Button } from "./components/Button";
export { Pill, type PillTone } from "./components/Pill";
export { Drawer, Field, FieldGrid, Chips, Chip } from "./components/Drawer";
export { ConfirmDialog } from "./components/ConfirmDialog";
export { LoginScreen } from "./components/LoginScreen";
export { Toggle } from "./components/Toggle";
export { DateRangeFilter, type DateRange } from "./components/DateRangeFilter";
export { DataTable, type Column } from "./components/DataTable";
export { Tabs, type Tab } from "./components/Tabs";
export { SectionHeader } from "./components/SectionHeader";

// Shell
export { AppShell } from "./shell/AppShell";
export { getActiveSection } from "./shell/util";
export type {
  NavSection,
  NavChild,
  ShellConfig,
  ShellUser,
  ShellBrand,
  PaletteItem,
} from "./shell/types";
