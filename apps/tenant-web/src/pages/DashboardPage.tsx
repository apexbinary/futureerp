import { invoices, money } from "../data/invoices";
import styles from "./page.module.css";

export function DashboardPage() {
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className={styles.inner}>
      <div className={styles.breadcrumb}>
        <span>Dashboard</span>
        <span className={styles.sep}>›</span>
        <span>Home</span>
      </div>

      <div className={styles.head}>
        <div>
          <h1>Good morning, Nethriya</h1>
          <p>Here's how ABC Corporation is doing today.</p>
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.label}>Revenue (MTD)</span>
          <span className={`${styles.value} tnum`}>{money(paid)}</span>
          <span className={styles.subtle}>collected this month</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Outstanding</span>
          <span className={`${styles.value} tnum`}>{money(outstanding)}</span>
          <span className={styles.subtle}>awaiting payment</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Open orders</span>
          <span className={`${styles.value} tnum`}>18</span>
          <span className={styles.subtle}>3 awaiting fulfilment</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Low-stock items</span>
          <span className={`${styles.value} tnum`} style={{ color: "var(--warning)" }}>5</span>
          <span className={styles.subtle}>reorder soon</span>
        </div>
      </div>

      <div
        className={styles.tableWrap}
        style={{ padding: 40, display: "grid", placeItems: "center", gap: 8, color: "var(--text-faint)" }}
      >
        <div style={{ fontWeight: 600, color: "var(--text-muted)" }}>Your workspace</div>
        <div style={{ fontSize: 12.5, maxWidth: 420, textAlign: "center" }}>
          Pick a module from the rail on the left. Try <b>Finance</b> → its menu opens in the second sidebar,
          then open <b>Invoices</b>. Press <b>⌘K</b> to jump anywhere.
        </div>
      </div>
    </div>
  );
}
