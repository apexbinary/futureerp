import { useLocation, useNavigate } from "react-router-dom";
import { useShell } from "./ShellContext";
import { getActiveSection } from "./util";
import type { NavSection } from "./types";
import styles from "./shell.module.css";

export function Rail() {
  const { sections, settingsSection, brand } = useShell();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = getActiveSection(sections, settingsSection, pathname);

  const item = (s: NavSection) => {
    const Icon = s.icon;
    return (
      <button
        key={s.id}
        className={`${styles.railBtn} ${active.id === s.id ? styles.railActive : ""}`}
        aria-label={s.label}
        aria-current={active.id === s.id ? "page" : undefined}
        onClick={() => navigate(s.children[0].path)}
      >
        <Icon />
        <span className={styles.railTip} role="tooltip">
          {s.label}
        </span>
      </button>
    );
  };

  return (
    <div className={styles.rail}>
      <div className={styles.railLogo} title={brand.name}>
        {brand.mark}
      </div>
      {sections.map(item)}
      <div className={styles.railGrow} />
      {item(settingsSection)}
    </div>
  );
}
