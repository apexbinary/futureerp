import type { ReactNode } from "react";
import styles from "./Pill.module.css";

export type PillTone = "neutral" | "success" | "warning" | "danger" | "primary";

export function Pill({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
