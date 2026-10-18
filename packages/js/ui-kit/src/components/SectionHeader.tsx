import { type ReactNode } from "react";
import styles from "./SectionHeader.module.css";

/** Section title with a small accent bar (FreightPro "Branch Performance" pattern). */
export function SectionHeader({
  title,
  right,
}: {
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className={styles.head}>
      <span className={styles.bar} aria-hidden />
      <span className={styles.title}>{title}</span>
      {right && <span className={styles.right}>{right}</span>}
    </div>
  );
}
