import { useMemo, useState } from "react";
import { Search, Download, Plus, Cloud, Server, ArrowUpCircle } from "lucide-react";
import {
  Button, Pill, type PillTone, Drawer, Field, FieldGrid, Chips, Chip, useToast,
} from "@future-erp/ui-kit";
import { tenants, type Tenant, type Health, type TenantStatus } from "../data/tenants";
import styles from "./page.module.css";

type Filter = "all" | "cloud" | "self_hosted" | "needs_update" | "attention";

const healthTone: Record<Health, PillTone> = { healthy: "success", warning: "warning", offline: "danger" };
const healthLabel: Record<Health, string> = { healthy: "Healthy", warning: "Warning", offline: "Offline" };
const statusTone: Record<TenantStatus, PillTone> = { active: "success", trial: "primary", suspended: "danger" };
const statusLabel: Record<TenantStatus, string> = { active: "Active", trial: "Trial", suspended: "Suspended" };

function matches(t: Tenant, filter: Filter): boolean {
  switch (filter) {
    case "cloud": return t.deployment === "cloud";
    case "self_hosted": return t.deployment === "self_hosted";
    case "needs_update": return t.version !== t.latestVersion;
    case "attention": return t.health !== "healthy" || t.status === "suspended";
    default: return true;
  }
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("");
}

export function TenantsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Tenant | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter(
      (t) => matches(t, filter) && (!q || t.name.toLowerCase().includes(q) || t.code.includes(q)),
    );
  }, [filter, query]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All tenants" },
    { key: "cloud", label: "Cloud" },
    { key: "self_hosted", label: "Self-hosted" },
    { key: "needs_update", label: "Needs update" },
    { key: "attention", label: "Needs attention" },
  ];

  const openTenant = (t: Tenant) => {
    setCurrent(t);
    setOpen(true);
  };

  const needsUpdate = current && current.version !== current.latestVersion;

  return (
    <div className={styles.inner}>
      <div className={styles.breadcrumb}>
        <span>Control Plane</span>
        <span className={styles.sep}>›</span>
        <span>Tenants</span>
      </div>

      <div className={styles.head}>
        <div>
          <h1>Tenants</h1>
          <p>Every client, everywhere — cloud &amp; self-hosted · {tenants.length} total</p>
        </div>
        <div className={styles.actions}>
          <Button onClick={() => toast("Export started")}>
            <Download />
            Export
          </Button>
          <Button variant="primary" onClick={() => toast("New tenant wizard opened")}>
            <Plus />
            New tenant
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        {chips.map((c) => (
          <button
            key={c.key}
            className={`${styles.chip} ${filter === c.key ? styles.chipOn : ""}`}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
        <div className={styles.searchInline}>
          <Search size={15} />
          <input placeholder="Filter tenants…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Deployment</th>
                <th>Plan</th>
                <th>Modules</th>
                <th>Version</th>
                <th className={styles.num}>Users</th>
                <th>Status</th>
                <th>Health</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} onClick={() => openTenant(t)}>
                  <td>
                    <div className={styles.cust}>
                      <span className={styles.ini}>{initials(t.name)}</span>
                      <div>
                        <div className={styles.custName}>{t.name}</div>
                        <div className={styles.custCode}>{t.code}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {t.deployment === "cloud" ? (
                      <Pill tone="primary"><Cloud size={13} /> Cloud</Pill>
                    ) : (
                      <Pill tone="neutral"><Server size={13} /> Self-hosted</Pill>
                    )}
                  </td>
                  <td>{t.plan}</td>
                  <td>
                    <div className={styles.modules}>
                      {t.modules.slice(0, 3).map((m) => (
                        <span key={m} className={styles.modTag}>{m}</span>
                      ))}
                      {t.modules.length > 3 && <span className={styles.modMore}>+{t.modules.length - 3}</span>}
                    </div>
                  </td>
                  <td>
                    <span className={styles.version}>
                      {t.version}
                      {t.version !== t.latestVersion && (
                        <span className={styles.updateChip}><ArrowUpCircle size={11} /> {t.latestVersion}</span>
                      )}
                    </span>
                  </td>
                  <td className={`${styles.num} tnum`}>{t.users}</td>
                  <td><Pill tone={statusTone[t.status]} dot>{statusLabel[t.status]}</Pill></td>
                  <td><Pill tone={healthTone[t.health]} dot>{healthLabel[t.health]}</Pill></td>
                  <td className={styles.lastSeen}>{t.lastSeen}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className={styles.empty}>No tenants match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={current?.name ?? ""}
        subtitle={current?.code}
        footer={
          current && (
            <>
              {needsUpdate ? (
                <Button
                  variant="primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    toast(`Update ${current.latestVersion} pushed to ${current.name}`);
                    setOpen(false);
                  }}
                >
                  <ArrowUpCircle size={16} />
                  Push update
                </Button>
              ) : (
                <Button variant="primary" style={{ flex: 1 }} onClick={() => toast("License manager opened")}>
                  Manage license
                </Button>
              )}
              <Button
                onClick={() =>
                  toast(`${current.name} ${current.status === "suspended" ? "reactivated" : "suspended"}`)
                }
              >
                {current.status === "suspended" ? "Reactivate" : "Suspend"}
              </Button>
            </>
          )
        }
      >
        {current && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill tone={statusTone[current.status]} dot>{statusLabel[current.status]}</Pill>
              <Pill tone={healthTone[current.health]} dot>{healthLabel[current.health]}</Pill>
              {current.deployment === "cloud" ? (
                <Pill tone="primary"><Cloud size={13} /> Cloud</Pill>
              ) : (
                <Pill tone="neutral"><Server size={13} /> Self-hosted</Pill>
              )}
            </div>

            <FieldGrid>
              <Field label="Plan">{current.plan}</Field>
              <Field label="Users"><span className="tnum">{current.users}</span></Field>
              <Field label="Version">
                <span className="mono">{current.version}</span>
                {needsUpdate && (
                  <span className={styles.updateChip} style={{ marginLeft: 8 }}>
                    <ArrowUpCircle size={11} /> {current.latestVersion}
                  </span>
                )}
              </Field>
              <Field label="Region">{current.region}</Field>
              <Field label="Last seen">{current.lastSeen}</Field>
              <Field label="Tenant ID"><span className="mono">{current.id}</span></Field>
            </FieldGrid>

            <div>
              <div
                style={{
                  fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".07em",
                  color: "var(--text-faint)", fontWeight: 700, marginBottom: 6,
                }}
              >
                Licensed modules
              </div>
              <Chips>
                {current.modules.map((m) => (
                  <Chip key={m}>{m}</Chip>
                ))}
              </Chips>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
