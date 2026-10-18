import styles from "./Tabs.module.css";

export type Tab = { key: string; label: string; count?: number };

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          className={`${styles.tab} ${t.key === active ? styles.active : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className={styles.count}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
