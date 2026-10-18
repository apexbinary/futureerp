// Mock tenant registry — stands in for the control-plane Tenancy API until it's built.
// Shape mirrors the Tenant model we sketched (id, name, code, deployment, status, ...).

export type Deployment = "cloud" | "self_hosted";
export type TenantStatus = "active" | "trial" | "suspended";
export type Health = "healthy" | "warning" | "offline";

export interface Tenant {
  id: string;
  name: string;
  code: string;
  deployment: Deployment;
  status: TenantStatus;
  health: Health;
  plan: string;
  modules: string[];
  version: string;
  latestVersion: string;
  users: number;
  region: string;
  lastSeen: string;
}

export const LATEST_VERSION = "2.5.1";

export const tenants: Tenant[] = [
  { id: "t_ab12", name: "ABC Corporation", code: "abc-corp", deployment: "cloud", status: "active", health: "healthy", plan: "Growth", modules: ["Finance", "Sales", "Inventory"], version: "2.5.1", latestVersion: LATEST_VERSION, users: 42, region: "US-East", lastSeen: "2 min ago" },
  { id: "t_nw40", name: "Northwind Traders", code: "northwind", deployment: "self_hosted", status: "active", health: "warning", plan: "Enterprise", modules: ["Finance", "Procurement", "HR"], version: "2.3.0", latestVersion: LATEST_VERSION, users: 180, region: "EU-Central", lastSeen: "1 h ago" },
  { id: "t_mf88", name: "Meridian Foods", code: "meridian", deployment: "cloud", status: "active", health: "healthy", plan: "Growth", modules: ["Finance", "Inventory"], version: "2.5.1", latestVersion: LATEST_VERSION, users: 28, region: "US-West", lastSeen: "just now" },
  { id: "t_vi23", name: "Volt Industries", code: "volt", deployment: "self_hosted", status: "active", health: "offline", plan: "Enterprise", modules: ["Finance", "Manufacturing"], version: "2.1.4", latestVersion: LATEST_VERSION, users: 95, region: "APAC", lastSeen: "3 days ago" },
  { id: "t_cc55", name: "Cedar & Co.", code: "cedar", deployment: "cloud", status: "trial", health: "healthy", plan: "Trial", modules: ["Finance"], version: "2.5.1", latestVersion: LATEST_VERSION, users: 6, region: "US-East", lastSeen: "12 min ago" },
  { id: "t_hm37", name: "Halcyon Media", code: "halcyon", deployment: "cloud", status: "active", health: "healthy", plan: "Starter", modules: ["Finance", "Sales"], version: "2.5.0", latestVersion: LATEST_VERSION, users: 15, region: "EU-West", lastSeen: "40 min ago" },
  { id: "t_bl36", name: "Brightpath Labs", code: "brightpath", deployment: "self_hosted", status: "active", health: "healthy", plan: "Enterprise", modules: ["Finance", "HR", "Procurement", "Inventory"], version: "2.5.1", latestVersion: LATEST_VERSION, users: 240, region: "US-Central", lastSeen: "5 min ago" },
  { id: "t_qs35", name: "Quill Stationery", code: "quill", deployment: "cloud", status: "suspended", health: "offline", plan: "Starter", modules: ["Finance"], version: "2.4.2", latestVersion: LATEST_VERSION, users: 9, region: "EU-West", lastSeen: "8 days ago" },
  { id: "t_dx19", name: "Delta Logistics", code: "delta", deployment: "self_hosted", status: "active", health: "warning", plan: "Growth", modules: ["Finance", "Inventory", "Procurement"], version: "2.4.2", latestVersion: LATEST_VERSION, users: 62, region: "APAC", lastSeen: "2 h ago" },
  { id: "t_om71", name: "Orion Manufacturing", code: "orion", deployment: "cloud", status: "active", health: "healthy", plan: "Enterprise", modules: ["Finance", "Manufacturing", "Inventory", "HR"], version: "2.5.1", latestVersion: LATEST_VERSION, users: 310, region: "US-East", lastSeen: "just now" },
];
