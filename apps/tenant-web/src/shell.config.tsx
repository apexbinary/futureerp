import {
  LayoutDashboard, Landmark, ShoppingCart, Boxes, Truck, Users, Settings,
  Home, FileText, BookOpen, CreditCard, Receipt, BarChart3, ClipboardList,
  Package, Layers, Warehouse, ShoppingBag, Building2, Wallet, CalendarDays,
  SlidersHorizontal, Bell, ShieldCheck, UserPlus, KeyRound, LayoutList, Grid3x3,
  Mail, Waypoints, ScrollText, ListTree, TrendingUp,
} from "lucide-react";
import type { NavSection, ShellConfig } from "@future-erp/ui-kit";

export const sections: NavSection[] = [
  {
    id: "dashboard", label: "Dashboard", description: "Your business at a glance", icon: LayoutDashboard,
    children: [{ label: "Home", path: "/", icon: Home }],
  },
  {
    id: "finance", label: "Finance", description: "FI/CO — money in & out", icon: Landmark,
    children: [
      { label: "Customer Invoices", path: "/finance", icon: FileText },
      { label: "Customers", path: "/finance/customers", icon: Users },
      { label: "Items", path: "/finance/items", icon: Package },
      { label: "Chart of Accounts", path: "/finance/accounts", icon: ListTree },
      { label: "Vendors", path: "/finance/vendors", icon: Building2 },
      { label: "Vendor Invoices", path: "/finance/bills", icon: ShoppingBag },
      { label: "Payments", path: "/finance/payments", icon: CreditCard },
      { label: "Aging", path: "/finance/aging", icon: CalendarDays },
      { label: "Fixed Assets", path: "/finance/assets", icon: Boxes },
      { label: "Cost Centers", path: "/finance/cost-centers", icon: Layers },
      { label: "Profit Centers", path: "/finance/profit-centers", icon: TrendingUp },
      { label: "Accounting Documents", path: "/finance/journal", icon: BookOpen },
      { label: "Tax", path: "/finance/tax", icon: Receipt },
      { label: "Organization", path: "/finance/organization", icon: Settings },
      { label: "Reports", path: "/finance/reports", icon: BarChart3 },
    ],
  },
  {
    id: "sales", label: "Sales", description: "Orders & customers", icon: ShoppingCart,
    children: [
      { label: "Orders", path: "/sales", icon: ClipboardList },
      { label: "Customers", path: "/sales/customers", icon: Users },
      { label: "Quotes", path: "/sales/quotes", icon: FileText },
    ],
  },
  {
    id: "inventory", label: "Inventory", description: "Items & stock", icon: Boxes,
    children: [
      { label: "Items", path: "/inventory", icon: Package },
      { label: "Stock levels", path: "/inventory/stock", icon: Layers },
      { label: "Warehouses", path: "/inventory/warehouses", icon: Warehouse },
    ],
  },
  {
    id: "procurement", label: "Procurement", description: "Buying & suppliers", icon: Truck,
    children: [
      { label: "Purchase orders", path: "/procurement", icon: ShoppingBag },
      { label: "Suppliers", path: "/procurement/suppliers", icon: Building2 },
    ],
  },
  {
    id: "hr", label: "HR", description: "People & payroll", icon: Users,
    children: [
      { label: "Employees", path: "/hr", icon: Users },
      { label: "Payroll", path: "/hr/payroll", icon: Wallet },
      { label: "Leave", path: "/hr/leave", icon: CalendarDays },
    ],
  },
  {
    id: "admin", label: "Admin", description: "Users & access control", icon: ShieldCheck,
    children: [
      { label: "Users", path: "/admin", icon: UserPlus },
      { label: "Roles", path: "/admin/roles", icon: Users },
      { label: "Pages", path: "/admin/pages", icon: LayoutList },
      { label: "Permissions", path: "/admin/permissions", icon: KeyRound },
      { label: "Permission matrix", path: "/admin/matrix", icon: Grid3x3 },
      { label: "SMTP configs", path: "/admin/smtp", icon: Mail },
      { label: "Email modules", path: "/admin/email-modules", icon: Waypoints },
      { label: "Email logs", path: "/admin/email-logs", icon: ScrollText },
    ],
  },
];

export const settingsSection: NavSection = {
  id: "settings", label: "Settings", description: "Preferences", icon: Settings,
  children: [
    { label: "General", path: "/settings", icon: SlidersHorizontal },
    { label: "Notifications", path: "/settings/notifications", icon: Bell },
  ],
};

export const allSections: NavSection[] = [...sections, settingsSection];

export const shellConfig: ShellConfig = {
  brand: { mark: "F", name: "FUTURE_ERP" },
  user: { name: "Nethriya", role: "client_admin", initials: "NE" },
  sections,
  settingsSection,
  searchPlaceholder: "Search invoices, customers, items…",
};
