import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, Check, AlertCircle, Sun, Moon } from "lucide-react";
import { useTheme } from "../theme";
import styles from "./LoginScreen.module.css";

const DEFAULT_FEATURES = [
  "Finance, sales, inventory & HR in one platform",
  "Bank-grade security with full audit trails",
  "Run in our cloud or self-hosted",
];

export function LoginScreen({
  brandName = "FUTURE_ERP",
  brandMark = "F",
  headline = "The modular ERP platform.",
  tagline = "One system for finance, operations, and people.",
  features = DEFAULT_FEATURES,
  footer,
  error,
  onSubmit,
}: {
  brandName?: string;
  brandMark?: string;
  headline?: string;
  tagline?: string;
  features?: string[];
  footer?: string;
  error?: string | null;
  onSubmit: (email: string, password: string) => Promise<boolean> | void;
}) {
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(email, password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <button className={styles.themeToggle} onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      {/* Brand panel */}
      <div className={styles.brandPanel}>
        <div className={styles.grid} aria-hidden />
        <div className={styles.brandInner}>
          <div className={styles.brandTop}>
            <div className={styles.logo}>{brandMark}</div>
            <span className={styles.brandName}>{brandName}</span>
          </div>
          <div className={styles.brandBody}>
            <h2 className={styles.headline}>{headline}</h2>
            <p className={styles.tagline}>{tagline}</p>
            <ul className={styles.features}>
              {features.map((f) => (
                <li key={f} className={styles.feature}>
                  <span className={styles.featureIcon}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.brandFoot}>{footer ?? "© FUTURE_ERP"}</div>
        </div>
      </div>

      {/* Form panel */}
      <div className={styles.formPanel}>
        <form className={styles.card} onSubmit={submit}>
          <div className={styles.mobileBrand}>
            <div className={styles.mobileLogo}>{brandMark}</div>
            <span className={styles.mobileName}>{brandName}</span>
          </div>

          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.sub}>Welcome back. Enter your credentials to continue.</p>

          {error && (
            <div className={styles.error}>
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className={styles.label}>
            Password
            <div className={styles.pwWrap}>
              <input
                className={styles.input}
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div className={styles.row}>
            <label className={styles.remember}>
              <input type="checkbox" /> Remember me
            </label>
            <a className={styles.forgot} href="#">Forgot password?</a>
          </div>

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className={styles.spin} size={16} /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className={styles.legal}>
            Protected by enterprise-grade security. By continuing you agree to the Terms &amp; Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  );
}
