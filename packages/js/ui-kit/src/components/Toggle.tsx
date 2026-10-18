import styles from "./Toggle.module.css";

export function Toggle({
  checked,
  onChange,
  disabled,
  small,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  small?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`${styles.toggle} ${checked ? styles.on : ""} ${small ? styles.sm : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}
