/**
 * Session context: tracks the active dataset/analysis session.
 * Persists session_id in sessionStorage so page refreshes don't lose it.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AnalysisSummaryResponse, DatasetMeta } from "@/types/api";
import { getSummary, listDatasets } from "@/lib/api";

interface SessionState {
  sessionId: string | null;
  meta: DatasetMeta | null;
  summary: AnalysisSummaryResponse | null;
  loading: boolean;
  error: string | null;

  setSession: (id: string, meta?: DatasetMeta) => void;
  clearSession: () => void;
  refreshSummary: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

const STORAGE_KEY = "profitleak_session_id";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(
    () => sessionStorage.getItem(STORAGE_KEY)
  );
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [summary, setSummary] = useState<AnalysisSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSession = useCallback((id: string, newMeta?: DatasetMeta) => {
    sessionStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    if (newMeta) setMeta(newMeta);
    setSummary(null);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionId(null);
    setMeta(null);
    setSummary(null);
  }, []);

  const refreshSummary = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSummary(sessionId);
      setSummary(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      // If session not found, clear it
      if (msg.includes("not found") || msg.includes("404")) {
        clearSession();
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, clearSession]);

  // On mount: verify stored session still exists, and load meta from dataset list
  useEffect(() => {
    if (!sessionId) return;
    listDatasets()
      .then(({ datasets }) => {
        const found = datasets.find((d) => d.session_id === sessionId);
        if (!found) {
          clearSession();
        } else {
          setMeta(found);
          if (found.status === "analyzed") {
            refreshSummary();
          }
        }
      })
      .catch(() => {
        // Server might be down; keep session id but don't crash
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SessionContext.Provider
      value={{ sessionId, meta, summary, loading, error, setSession, clearSession, refreshSummary }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
