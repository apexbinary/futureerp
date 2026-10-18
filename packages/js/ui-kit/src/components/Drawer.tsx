import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Drawer.module.css";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`${styles.scrim} ${open ? styles.show : ""}`} onClick={onClose} />
      <aside className={`${styles.drawer} ${open ? styles.show : ""}`} aria-hidden={!open} aria-label="Detail panel">
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            {subtitle && <div className={styles.sub}>{subtitle}</div>}
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </aside>
    </>
  );
}

/* Reusable field primitives for drawer content. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={styles.fieldGrid}>{children}</div>;
}
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.k}>{label}</span>
      <span className={styles.v}>{children}</span>
    </div>
  );
}
export function Chips({ children }: { children: ReactNode }) {
  return <div className={styles.chips}>{children}</div>;
}
export function Chip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}
