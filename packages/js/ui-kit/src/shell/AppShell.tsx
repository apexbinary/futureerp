import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { ShellProvider } from "./ShellContext";
import { Rail } from "./Rail";
import { SecondaryNav } from "./SecondaryNav";
import { Topbar } from "./Topbar";
import { CommandPalette } from "../components/CommandPalette";
import type { ShellConfig, PaletteItem } from "./types";
import styles from "./shell.module.css";

export function AppShell({ config }: { config: ShellConfig }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = [...config.sections, config.settingsSection].flatMap((s) =>
      s.children.map((c) => ({ group: s.label, label: c.label, icon: c.icon, path: c.path })),
    );
    return [...nav, ...(config.paletteExtras ?? [])];
  }, [config]);

  return (
    <ShellProvider value={config}>
      <div className={`${styles.app} ${collapsed ? styles.collapsed : ""}`}>
        <Rail />
        <SecondaryNav />
        <div className={styles.mainCol}>
          <Topbar
            onOpenPalette={() => setPaletteOpen(true)}
            onTogglePanel={() => setCollapsed((c) => !c)}
          />
          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
      </div>
    </ShellProvider>
  );
}
