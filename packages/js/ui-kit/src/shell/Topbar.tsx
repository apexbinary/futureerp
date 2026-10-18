import { Search, Bell, Sun, Moon, PanelLeft } from "lucide-react";
import { Button } from "../components/Button";
import { useTheme } from "../theme";
import { useShell } from "./ShellContext";
import styles from "./shell.module.css";

export function Topbar({
  onOpenPalette,
  onTogglePanel,
}: {
  onOpenPalette: () => void;
  onTogglePanel: () => void;
}) {
  const { theme, toggle } = useTheme();
  const { user, searchPlaceholder } = useShell();
  return (
    <div className={styles.topbar}>
      <Button variant="icon" onClick={onTogglePanel} title="Toggle sidebar" aria-label="Toggle sidebar">
        <PanelLeft />
      </Button>
      <button className={styles.search} onClick={onOpenPalette} aria-label="Search or run a command">
        <Search size={16} />
        <span className={styles.searchText}>{searchPlaceholder ?? "Search or run a command…"}</span>
        <span className={styles.kbd}>⌘K</span>
      </button>
      <div className={styles.spacer} />
      <Button variant="icon" title="Notifications" aria-label="Notifications">
        <Bell />
      </Button>
      <Button variant="icon" onClick={toggle} title="Toggle theme" aria-label="Toggle light or dark theme">
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
      <div className={styles.avatar} title={user.name}>
        {user.initials}
      </div>
    </div>
  );
}
