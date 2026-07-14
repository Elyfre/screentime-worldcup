"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Save, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatMinutesToTime } from "@/lib/utils";
import { getArgentinaNow, getWeekRange } from "@/lib/week";

type AdminLogRow = {
  id: string;
  playerName: string;
  logDate: string;
  minutesLogged: number;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AdminPanel() {
  const [logs, setLogs] = useState<AdminLogRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [adminSecret, setAdminSecret] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function fetchLogs() {
      const weekRange = getWeekRange(getArgentinaNow());

      const { data } = await supabase
        .from("daily_logs")
        .select("id, log_date, minutes_logged, players(name)")
        .gte("log_date", weekRange.start)
        .lte("log_date", weekRange.end)
        .order("log_date", { ascending: false });

      if (!isCurrent) return;

      const rows: AdminLogRow[] = (data ?? []).map((row) => {
        const playersRelation = row.players as { name?: string }[] | { name?: string } | null;
        const playerName = Array.isArray(playersRelation)
          ? playersRelation[0]?.name
          : playersRelation?.name;

        return {
          id: row.id,
          playerName: playerName ?? "Jugador",
          logDate: row.log_date,
          minutesLogged: row.minutes_logged ?? 0,
        };
      });

      setLogs(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, String(row.minutesLogged)])));
      setIsLoading(false);
    }

    fetchLogs();

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handleSave(logId: string) {
    const draftValue = Number(drafts[logId]);
    if (!Number.isFinite(draftValue) || draftValue < 0) {
      setSaveStates((prev) => ({ ...prev, [logId]: "error" }));
      return;
    }

    if (!adminSecret) {
      setSaveStates((prev) => ({ ...prev, [logId]: "error" }));
      return;
    }

    setSaveStates((prev) => ({ ...prev, [logId]: "saving" }));

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ log_id: logId, new_minutes: Math.round(draftValue) }),
      });

      if (!response.ok) {
        throw new Error("No se pudo guardar.");
      }

      setLogs((prev) =>
        prev.map((log) =>
          log.id === logId ? { ...log, minutesLogged: Math.round(draftValue) } : log
        )
      );
      setSaveStates((prev) => ({ ...prev, [logId]: "saved" }));
    } catch {
      setSaveStates((prev) => ({ ...prev, [logId]: "error" }));
    }
  }

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <ShieldCheck className="h-4 w-4" />
        Panel de Admin — semana actual
      </h2>

      <div className="mb-4 flex flex-col gap-1">
        <label
          htmlFor="adminSecret"
          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Clave de admin (requerida para guardar cambios)
        </label>
        <input
          id="adminSecret"
          type="password"
          value={adminSecret}
          onChange={(event) => setAdminSecret(event.target.value)}
          placeholder="Clave"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-zinc-400">Cargando...</p>
      ) : logs.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">
          No hay registros esta semana.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {logs.map((log) => {
            const saveState = saveStates[log.id] ?? "idle";
            return (
              <li key={log.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex items-center justify-between text-zinc-800 dark:text-zinc-200">
                  <span className="font-medium">{log.playerName}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {log.logDate}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Actual: {formatMinutesToTime(log.minutesLogged)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={drafts[log.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [log.id]: event.target.value }))
                    }
                    className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleSave(log.id)}
                    disabled={saveState === "saving"}
                    className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {saveState === "saving" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Guardar
                  </button>
                  {saveState === "saved" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {saveState === "error" && <XCircle className="h-4 w-4 text-red-500" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
