import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Variant = "default" | "primary" | "ghost" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "default", className = "", children, ...rest }: Props) {
  const v = variant === "default" ? "" : styles[variant];
  return (
    <button className={`${styles.btn} ${v} ${className}`} {...rest}>
      {children}
    </button>
  );
}
