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
  variant = "modal",
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** "modal" = centered pop-up (default); "side" = right-hand slide-over. */
  variant?: "modal" | "side";
  /** Modal width: md ≈ 640px, lg ≈ 860px. */
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the pop-up is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const panel = (
    <>
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
    </>
  );

  if (variant === "side") {
    return (
      <>
        <div className={`${styles.scrim} ${open ? styles.show : ""}`} onClick={onClose} />
        <aside className={`${styles.drawer} ${open ? styles.show : ""}`} aria-hidden={!open} aria-label="Detail panel">
          {panel}
        </aside>
      </>
    );
  }

  return (
    <div className={`${styles.modalScrim} ${open ? styles.show : ""}`} onClick={onClose} aria-hidden={!open}>
      <div
        className={`${styles.modal} ${size === "lg" ? styles.lg : ""} ${open ? styles.show : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Detail panel"
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
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
