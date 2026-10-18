import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import type { PaletteItem } from "../shell/types";
import styles from "./CommandPalette.module.css";

export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (c) => c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s),
    );
  }, [q, items]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const run = (i: number) => {
    const c = filtered[i];
    if (c) {
      navigate(c.path);
      onClose();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(active);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.palette} role="dialog" aria-label="Command palette">
        <div className={styles.input}>
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search or jump to…"
            aria-label="Command palette search"
          />
          <span className={styles.kbd}>esc</span>
        </div>
        <div className={styles.list}>
          {filtered.length === 0 && <div className={styles.empty}>No results for “{q}”</div>}
          {filtered.map((c, i) => {
            const showGroup = i === 0 || filtered[i - 1].group !== c.group;
            const Icon = c.icon;
            return (
              <div key={`${c.group}-${c.label}-${i}`}>
                {showGroup && <div className={styles.group}>{c.group}</div>}
                <div
                  className={`${styles.item} ${i === active ? styles.itemActive : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(i)}
                >
                  <Icon size={17} />
                  <span>{c.label}</span>
                  {c.hint && <span className={styles.hint}>{c.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
