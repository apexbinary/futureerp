import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import styles from "./toast.module.css";

interface ToastItem {
  id: number;
  msg: string;
}

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.wrap}>
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            <Check size={16} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
