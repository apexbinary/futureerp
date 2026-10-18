import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface NavChild {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavSection {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  children: NavChild[];
}

export interface ShellUser {
  name: string;
  role: string;
  initials: string;
}

export interface ShellBrand {
  /** short mark shown in the rail logo, e.g. "F" */
  mark: string;
  /** full name (used as tooltip / a11y) */
  name: string;
}

export interface PaletteItem {
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  path: string;
}

export interface ShellConfig {
  brand: ShellBrand;
  user: ShellUser;
  sections: NavSection[];
  settingsSection: NavSection;
  /** extra records surfaced in ⌘K beyond navigation (e.g. tenants, customers) */
  paletteExtras?: PaletteItem[];
  /** placeholder text for the top-bar search / palette trigger */
  searchPlaceholder?: ReactNode;
}
