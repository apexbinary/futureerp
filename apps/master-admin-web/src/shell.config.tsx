import {
  LayoutDashboard, Building2, KeyRound, PackageCheck, Activity, CreditCard, Settings,
  Gauge, HeartPulse, ScrollText, List, Cloud, Server, Rocket, Package, ToggleRight,
  FileKey, GitBranch, Radio, Boxes, LineChart, Bell, RefreshCw, FileText, TrendingUp,
  SlidersHorizontal, Users,
} from "lucide-react";
import type { NavSection, ShellConfig, PaletteItem } from "@future-erp/ui-kit";
import { tenants } from "./data/tenants";

export const sections: NavSection[] = [
  {
    id: "overview", label: "Overview", description: "Fleet at a glance", icon: LayoutDashboard,
    children: [
      { label: "Summary", path: "/", icon: Gauge },
      { label: "Fleet health", path: "/overview/health", icon: HeartPulse },
      { label: "Activity log", path: "/overview/activity", icon: ScrollText },
    ],
  },
  {
    id: "tenants", label: "Tenants", description: "Every client, everywhere", icon: Building2,
    children: [
      { label: "All tenants", path: "/tenants", icon: List },
      { label: "Cloud", path: "/tenants/cloud", icon: Cloud },
      { label: "Self-hosted", path: "/tenants/self-hosted", icon: Server },
      { label: "Provisioning", path: "/tenants/provisioning", icon: Rocket },
    ],
  },
  {
    id: "licenses", label: "Licenses", description: "Entitlements & plans", icon: KeyRound,
    children: [
      { label: "Issued licenses", path: "/licenses", icon: FileKey },
      { label: "Plans & packaging", path: "/licenses/plans", icon: Package },
      { label: "Entitlements", path: "/licenses/entitlements", icon: ToggleRight },
      { label: "Usage", path: "/licenses/usage", icon: Gauge },
    ],
  },
  {
    id: "releases", label: "Releases", description: "Versions & rollouts", icon: PackageCheck,
    children: [
      { label: "Versions", path: "/releases", icon: GitBranch },
      { label: "Channels", path: "/releases/channels", icon: Radio },
      { label: "Rollouts", path: "/releases/rollouts", icon: Rocket },
      { label: "Artifacts", path: "/releases/artifacts", icon: Boxes },
    ],
  },
  {
    id: "health", label: "Health", description: "Nodes & telemetry", icon: Activity,
    children: [
      { label: "Heartbeats", path: "/health", icon: HeartPulse },
      { label: "Telemetry", path: "/health/telemetry", icon: LineChart },
      { label: "Alerts", path: "/health/alerts", icon: Bell },
    ],
  },
  {
    id: "billing", label: "Billing", description: "Subscriptions & revenue", icon: CreditCard,
    children: [
      { label: "Subscriptions", path: "/billing", icon: RefreshCw },
      { label: "Invoices", path: "/billing/invoices", icon: FileText },
      { label: "Revenue", path: "/billing/revenue", icon: TrendingUp },
    ],
  },
];

export const settingsSection: NavSection = {
  id: "settings", label: "Settings", description: "Configuration", icon: Settings,
  children: [
    { label: "General", path: "/settings", icon: SlidersHorizontal },
    { label: "Team & roles", path: "/settings/roles", icon: Users },
    { label: "API keys", path: "/settings/api-keys", icon: KeyRound },
    { label: "Audit log", path: "/settings/audit", icon: ScrollText },
  ],
};

export const allSections: NavSection[] = [...sections, settingsSection];

const paletteExtras: PaletteItem[] = tenants.map((t) => ({
  group: "Tenants",
  label: t.name,
  hint: t.deployment === "cloud" ? "Cloud" : "Self-hosted",
  icon: Building2,
  path: "/tenants",
}));

export const shellConfig: ShellConfig = {
  brand: { mark: "F", name: "FUTURE_ERP Admin" },
  user: { name: "Super Admin", role: "super_admin", initials: "SA" },
  sections,
  settingsSection,
  paletteExtras,
  searchPlaceholder: "Search tenants, licenses, releases…",
};
