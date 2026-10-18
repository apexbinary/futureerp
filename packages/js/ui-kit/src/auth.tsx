import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  [k: string]: unknown;
}

type Status = "loading" | "authed" | "anon";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** fetch against the auth baseUrl with the access token attached + auto-refresh on 401 */
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "anon",
  user: null,
  error: null,
  login: async () => false,
  logout: async () => {},
  authFetch: async () => new Response(null, { status: 401 }),
});

export function AuthProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const access = useRef<string | null>(null);
  const didInit = useRef(false);

  const doRefresh = useCallback(async (): Promise<boolean> => {
    const r = await fetch(`${baseUrl}/api/auth/refresh/`, { method: "POST", credentials: "include" });
    if (!r.ok) return false;
    const d = await r.json();
    access.current = d.access;
    return true;
  }, [baseUrl]);

  const fetchMe = useCallback(async (): Promise<AuthUser | null> => {
    const r = await fetch(`${baseUrl}/api/auth/me/`, {
      credentials: "include",
      headers: access.current ? { Authorization: `Bearer ${access.current}` } : {},
    });
    return r.ok ? r.json() : null;
  }, [baseUrl]);

  // Bootstrap once: try the refresh cookie -> hydrate the session.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      if (await doRefresh()) {
        const me = await fetchMe();
        if (me) {
          setUser(me);
          setStatus("authed");
          return;
        }
      }
      setStatus("anon");
    })();
  }, [doRefresh, fetchMe]);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setError(null);
      const r = await fetch(`${baseUrl}/api/auth/login/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        setError("Invalid email or password.");
        return false;
      }
      const d = await r.json();
      access.current = d.access;
      setUser(d.user);
      setStatus("authed");
      return true;
    },
    [baseUrl],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${baseUrl}/api/auth/logout/`, { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    access.current = null;
    setUser(null);
    setStatus("anon");
  }, [baseUrl]);

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const build = (): RequestInit => ({
        ...init,
        credentials: "include",
        headers: {
          ...(init.headers || {}),
          ...(access.current ? { Authorization: `Bearer ${access.current}` } : {}),
        },
      });
      let res = await fetch(`${baseUrl}${path}`, build());
      if (res.status === 401 && (await doRefresh())) {
        res = await fetch(`${baseUrl}${path}`, build());
      }
      return res;
    },
    [baseUrl, doRefresh],
  );

  return (
    <AuthContext.Provider value={{ status, user, error, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
