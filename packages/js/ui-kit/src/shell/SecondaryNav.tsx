import { useRef, useState, type KeyboardEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useShell } from "./ShellContext";
import { useAuth } from "../auth";
import { getActiveSection } from "./util";
import styles from "./shell.module.css";

export function SecondaryNav() {
  const { sections, settingsSection, user } = useShell();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const section = getActiveSection(sections, settingsSection, pathname);
  const Icon = section.icon;
  const listRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (!items.length) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLAnchorElement);
    const next =
      e.key === "ArrowDown"
        ? idx < 0 ? 0 : (idx + 1) % items.length
        : idx <= 0 ? items.length - 1 : idx - 1;
    items[next]?.focus();
  };

  return (
    <div className={styles.secondary}>
      <div className={styles.secHeader} key={section.id}>
        <span className={styles.secIcon}>
          <Icon size={16} />
        </span>
        <div className={styles.secHeaderText}>
          <div className={styles.secTitle}>{section.label}</div>
          <div className={styles.secSub}>{section.description}</div>
        </div>
      </div>

      <div className={styles.secList} key={"list-" + section.id} ref={listRef} onKeyDown={onKeyDown}>
        {section.children.map((c) => {
          const CIcon = c.icon;
          return (
            <NavLink
              key={c.path}
              to={c.path}
              end
              className={({ isActive }) => `${styles.secItem} ${isActive ? styles.secActive : ""}`}
            >
              <CIcon />
              <span>{c.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className={styles.userWrap}>
        {menuOpen && (
          <>
            <div className={styles.menuScrim} onClick={() => setMenuOpen(false)} />
            <div className={styles.userMenu}>
              <button
                className={styles.userMenuItem}
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </>
        )}
        <button className={styles.secUser} onClick={() => setMenuOpen((o) => !o)}>
          <span className={styles.secUserAvatar}>{user.initials}</span>
          <span className={styles.secUserText}>
            <span className={styles.secUserName}>{user.name}</span>
            <span className={styles.secUserRole}>{user.role}</span>
          </span>
          <ChevronsUpDown size={15} className={styles.secUserChevron} />
        </button>
      </div>
    </div>
  );
}
