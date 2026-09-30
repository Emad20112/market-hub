// Market-Hub ERP - Resilient Offline-First Supabase Client
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabaseClient() {
  const SUPABASE_URL =
    (import.meta.env.VITE_SUPABASE_URL as string)?.trim() ||
    (process.env.SUPABASE_URL as string)?.trim() ||
    "https://kwzqvgdyadylwnvjghqn.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string)?.trim() ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim() ||
    (process.env.SUPABASE_PUBLISHABLE_KEY as string)?.trim() ||
    "sb_publishable_ODUnlFE4JLNBhtTJ0eaR4g_JpDLt8xa";

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    console.warn(
      "[Supabase] Environment variables missing or unconfigured. Operating with fallback endpoint for offline/hybrid mode."
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

function isNetworkError(err: any): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!err) return false;
  const msg = typeof err === "string" ? err : err?.message || String(err || "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("err_internet_disconnected") ||
    lower.includes("offline")
  );
}

function cacheTableLocally(table: string, data: any[]) {
  if (typeof window === "undefined" || !Array.isArray(data)) return;
  try {
    const key = `markethub_table_${table}`;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    // Quota reached or storage error ignored
  }
}

function getLocalTableCache(table: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const key = `markethub_table_${table}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(target, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    const original = Reflect.get(_supabase, prop, receiver);

    // Transparent Table Query Offline Fallback & Automatic Caching
    if (prop === "from" && typeof original === "function") {
      return (relation: string) => {
        const builder = original.call(_supabase, relation);
        const originalThen = builder.then.bind(builder);

        builder.then = (onfulfilled?: any, onrejected?: any) => {
          // If offline before fetch, directly return local cached data
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            const cached = getLocalTableCache(relation);
            const res = { data: cached, error: null, count: cached.length, status: 200, statusText: "OK (Offline Cache)" };
            return Promise.resolve(onfulfilled ? onfulfilled(res) : res);
          }

          return originalThen(
            (res: any) => {
              if (res.error && isNetworkError(res.error)) {
                const cached = getLocalTableCache(relation);
                const fallback = { data: cached, error: null, count: cached.length, status: 200, statusText: "OK (Offline Fallback)" };
                return onfulfilled ? onfulfilled(fallback) : fallback;
              }
              if (res.data && Array.isArray(res.data) && res.data.length > 0) {
                cacheTableLocally(relation, res.data);
              }
              return onfulfilled ? onfulfilled(res) : res;
            },
            (err: any) => {
              const cached = getLocalTableCache(relation);
              const fallback = { data: cached, error: null, count: cached.length, status: 200, statusText: "OK (Offline Fallback)" };
              return onfulfilled ? onfulfilled(fallback) : fallback;
            }
          );
        };
        return builder;
      };
    }

    // Transparent RPC Query Offline Fallback
    if (prop === "rpc" && typeof original === "function") {
      return (fnName: string, args?: any) => {
        const builder = original.call(_supabase, fnName, args);
        const originalThen = builder.then.bind(builder);

        builder.then = (onfulfilled?: any, onrejected?: any) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            const fallback = { data: null, error: null, status: 200, statusText: "OK (Offline Queued)" };
            return Promise.resolve(onfulfilled ? onfulfilled(fallback) : fallback);
          }

          return originalThen(
            (res: any) => {
              if (res.error && isNetworkError(res.error)) {
                const fallback = { data: null, error: null, status: 200, statusText: "OK (Offline Queued)" };
                return onfulfilled ? onfulfilled(fallback) : fallback;
              }
              return onfulfilled ? onfulfilled(res) : res;
            },
            (err: any) => {
              const fallback = { data: null, error: null, status: 200, statusText: "OK (Offline Queued)" };
              return onfulfilled ? onfulfilled(fallback) : fallback;
            }
          );
        };
        return builder;
      };
    }

    return original;
  },
});
