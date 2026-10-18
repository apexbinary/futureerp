import { Construction } from "lucide-react";
import styles from "./page.module.css";

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className={styles.inner}>
      <div className={styles.breadcrumb}>
        <span>{note}</span>
        <span className={styles.sep}>›</span>
        <span>{title}</span>
      </div>
      <div className={styles.head}>
        <div>
          <h1>{title}</h1>
          <p>{note}</p>
        </div>
      </div>
      <div
        className={styles.tableWrap}
        style={{ padding: 48, display: "grid", placeItems: "center", gap: 12, color: "var(--text-faint)" }}
      >
        <Construction size={30} />
        <div style={{ fontWeight: 600, color: "var(--text-muted)" }}>Coming soon</div>
        <div style={{ fontSize: 12.5, maxWidth: 380, textAlign: "center" }}>
          This module screen is scaffolded and will be built out in a later phase.
        </div>
      </div>
    </div>
  );
}
