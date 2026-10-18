import type { NavSection } from "./types";

/** Resolve which section owns the current URL (drives rail highlight + secondary menu). */
export function getActiveSection(
  sections: NavSection[],
  settingsSection: NavSection,
  pathname: string,
): NavSection {
  const all = [...sections, settingsSection];

  // 1) match by section id prefix (e.g. /finance, /finance/invoices)
  const byId = all.find((s) => pathname === "/" + s.id || pathname.startsWith("/" + s.id + "/"));
  if (byId) return byId;

  // 2) match by an exact/prefixed child path (handles root "/" and custom paths)
  const byChild = all.find((s) =>
    s.children.some((c) => c.path === pathname || (c.path !== "/" && pathname.startsWith(c.path))),
  );
  if (byChild) return byChild;

  // 3) fall back to the section that owns "/"
  const root = all.find((s) => s.children.some((c) => c.path === "/"));
  return root ?? sections[0];
}
