import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useAuth } from "../auth";
import styles from "./DateRangeFilter.module.css";

export interface DateRange {
  from: string;      // YYYY-MM-DD (inclusive)
  to: string;        // YYYY-MM-DD (inclusive)
  preset: string;    // preset key, or "custom", or "all"
  label: string;
}

interface Preset { key: string; label: string; from: string; to: string; }

/**
 * Reusable date-range filter. Loads named presets from the backend's
 * /api/util/date-presets/ (so "last 7 days" math lives server-side) and also
 * supports a custom range. Calls onChange with the resolved {from,to}.
 */
export function DateRangeFilter({
  value,
  onChange,
  includeAll = true,
}: {
  value?: DateRange | null;
  onChange: (range: DateRange | null) => void;
  includeAll?: boolean;
}) {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authFetch("/api/util/date-presets/")
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((d) => setPresets(d.presets ?? []))
      .catch(() => {});
  }, [authFetch]);

  const pick = (p: Preset) => {
    onChange({ from: p.from, to: p.to, preset: p.key, label: p.label });
    setOpen(false);
  };
  const pickAll = () => { onChange(null); setOpen(false); };
  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    onChange({ from: customFrom, to: customTo, preset: "custom", label: `${customFrom} → ${customTo}` });
    setOpen(false);
  };

  const current = value?.label ?? (includeAll ? "All time" : "Select dates");

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={15} />
        {current}
        <ChevronDown size={14} className={styles.chev} />
      </button>

      {open && (
        <>
          <div className={styles.scrim} onClick={() => setOpen(false)} />
          <div className={styles.pop}>
            <div className={styles.presets}>
              {includeAll && (
                <button className={`${styles.preset} ${!value ? styles.active : ""}`} onClick={pickAll}>
                  All time
                </button>
              )}
              {presets.map((p) => (
                <button
                  key={p.key}
                  className={`${styles.preset} ${value?.preset === p.key ? styles.active : ""}`}
                  onClick={() => pick(p)}
                >
                  {p.label}
                  <span className={styles.range}>{p.from === p.to ? p.from : `${p.from} → ${p.to}`}</span>
                </button>
              ))}
            </div>
            <div className={styles.custom}>
              <span className={styles.customLabel}>Custom range</span>
              <div className={styles.dates}>
                <input className={styles.date} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" />
                <span style={{ color: "var(--text-faint)" }}>→</span>
                <input className={styles.date} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" />
              </div>
              <button className={styles.apply} onClick={applyCustom}>Apply</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
