import { useEffect, useState } from "react";
import { useAuth } from "./auth";

export interface Option {
  value: string;
  label: string;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const mem = new Map<string, { at: number; data: Option[] }>();

function readCache(key: string): Option[] | null {
  const m = mem.get(key);
  if (m && Date.now() - m.at < TTL_MS) return m.data;
  try {
    const raw = localStorage.getItem(`erp-opts:${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; data: Option[] };
      if (Date.now() - parsed.at < TTL_MS) {
        mem.set(key, parsed);
        return parsed.data;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(key: string, data: Option[]) {
  const entry = { at: Date.now(), data };
  mem.set(key, entry);
  try {
    localStorage.setItem(`erp-opts:${key}`, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

/**
 * Fetch a reference-data option set from /api/util/options/?set=<key>, cached for 1h
 * (in memory + localStorage). Dropdowns use this instead of hardcoding choices.
 */
export function useOptions(setKey: string): { options: Option[]; loading: boolean } {
  const { authFetch } = useAuth();
  const [options, setOptions] = useState<Option[]>(() => readCache(setKey) ?? []);
  const [loading, setLoading] = useState(options.length === 0);

  useEffect(() => {
    const cached = readCache(setKey);
    if (cached) {
      setOptions(cached);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    authFetch(`/api/util/options/?set=${encodeURIComponent(setKey)}`)
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((d) => {
        if (!alive) return;
        const opts: Option[] = d.options ?? [];
        writeCache(setKey, opts);
        setOptions(opts);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [setKey, authFetch]);

  return { options, loading };
}
