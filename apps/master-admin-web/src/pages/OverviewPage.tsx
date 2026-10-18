import { Cloud, Server, ArrowUpCircle } from "lucide-react";
import { Pill, type PillTone, fmtCount } from "@future-erp/ui-kit";
import { tenants, type Health } from "../data/tenants";
import styles from "./page.module.css";

const healthTone: Record<Health, PillTone> = { healthy: "success", warning: "warning", offline: "danger" };
const healthLabel: Record<Health, string> = { healthy: "Healthy", warning: "Warning", offline: "Offline" };

export function OverviewPage() {
  const total = tenants.length;
  const cloud = tenants.filter((t) => t.deployment === "cloud").length;
  const selfHosted = total - cloud;
  const active = tenants.filter((t) => t.status === "active").length;
  const needUpdate = tenants.filter((t) => t.version !== t.latestVersion);
  const attention = tenants.filter((t) => t.health !== "healthy" || t.status === "suspended");
  const totalUsers = tenants.reduce((s, t) => s + t.users, 0);

  return (
    <div className={styles.inner}>
      <div className={styles.breadcrumb}>
        <span>Control Plane</span>
        <span className={styles.sep}>›</span>
        <span>Overview</span>
      </div>

      <div className={styles.head}>
        <div>
          <h1>Overview</h1>
          <p>Health of every tenant across the fleet — cloud &amp; self-hosted.</p>
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.label}>Total tenants</span>
          <span className={`${styles.value} tnum`}>{total}</span>
          <span className={styles.sub}>{fmtCount(totalUsers)} users provisioned</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Deployment mix</span>
          <div className={styles.split}>
            <div>
              <span className={`${styles.n} tnum`}>{cloud}</span>
              <span className={styles.k}>
                <Cloud size={11} style={{ verticalAlign: "-1px" }} /> Cloud
              </span>
            </div>
            <div>
              <span className={`${styles.n} tnum`}>{selfHosted}</span>
              <span className={styles.k}>
                <Server size={11} style={{ verticalAlign: "-1px" }} /> Self-host
              </span>
            </div>
          </div>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Active licenses</span>
          <span className={`${styles.value} tnum`}>{active}</span>
          <span className={styles.sub}>{total - active} trial or suspended</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.label}>Needs update</span>
          <span className={`${styles.value} tnum`} style={{ color: needUpdate.length ? "var(--warning)" : undefined }}>
            {needUpdate.length}
          </span>
          <span className={styles.sub}>behind latest ({tenants[0].latestVersion})</span>
        </div>
      </div>

      <div className={styles.head} style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 16 }}>Needs attention</h1>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table} style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Deployment</th>
                <th>Version</th>
                <th>Health</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className={styles.cust}>
                      <span className={styles.ini}>
                        {t.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                      </span>
                      <div>
                        <div className={styles.custName}>{t.name}</div>
                        <div className={styles.custCode}>{t.code}</div>
                      </div>
                    </div>
                  </td>
                  <td>{t.deployment === "cloud" ? "Cloud" : "Self-hosted"}</td>
                  <td>
                    <span className={styles.version}>
                      {t.version}
                      {t.version !== t.latestVersion && (
                        <span className={styles.updateChip}>
                          <ArrowUpCircle size={11} /> {t.latestVersion}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <Pill tone={healthTone[t.health]} dot>
                      {healthLabel[t.health]}
                    </Pill>
                  </td>
                  <td className={styles.lastSeen}>{t.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
