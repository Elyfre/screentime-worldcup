"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Skull,
  PlusCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatMinutesToTime } from "@/lib/utils";
import {
  getArgentinaNow,
  getWeekRange,
  shiftDateByWeeks,
  getWeekDays,
  formatDayLabel,
} from "@/lib/week";
import { processCompletedWeeks } from "@/lib/tournament";

type LogEntry = {
  id: string;
  logDate: string;
  minutesLogged: number;
};

type PlayerGroup = {
  playerId: string;
  playerName: string;
  teamName: string | null;
  isEliminated: boolean;
  totalMinutes: number;
  entries: LogEntry[];
};

type RosterPlayer = {
  id: string;
  name: string;
  teamName: string | null;
  isEliminated: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function formatRangeLabel(range: { start: string; end: string }): string {
  const format = (key: string) => {
    const [, month, day] = key.split("-");
    return `${day}/${month}`;
  };
  return `${format(range.start)} - ${format(range.end)}`;
}

export default function AdminPanel() {
  const [adminSecret, setAdminSecret] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [groups, setGroups] = useState<PlayerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  const [manualPlayerId, setManualPlayerId] = useState("");
  const [manualDayOverride, setManualDayOverride] = useState<string | null>(null);
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualState, setManualState] = useState<SaveState>("idle");
  const [manualMessage, setManualMessage] = useState("");

  const now = useMemo(() => getArgentinaNow(), []);
  const weekRange = useMemo(
    () => getWeekRange(shiftDateByWeeks(now, weekOffset)),
    [now, weekOffset]
  );
  const weekDays = useMemo(() => getWeekDays(weekRange.start), [weekRange]);
  const isCurrentWeek = weekOffset === 0;
  const canGoNext = weekOffset < 0;
  const manualDay =
    manualDayOverride && weekDays.includes(manualDayOverride)
      ? manualDayOverride
      : weekDays[weekDays.length - 1] ?? "";

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function fetchWeekData() {
      setIsLoading(true);

      const [{ data: playersData }, { data: logsData }] = await Promise.all([
        supabase.from("players").select("id, name, team_name, is_eliminated").order("name"),
        supabase
          .from("daily_logs")
          .select("id, player_id, log_date, minutes_logged, players(name, team_name, is_eliminated)")
          .gte("log_date", weekRange.start)
          .lte("log_date", weekRange.end)
          .order("log_date", { ascending: true }),
      ]);

      if (!isCurrent) return;

      const rosterList: RosterPlayer[] = (playersData ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        teamName: row.team_name ?? null,
        isEliminated: Boolean(row.is_eliminated),
      }));
      setRoster(rosterList);

      const rosterById = new Map(rosterList.map((player) => [player.id, player]));

      const byPlayer = new Map<string, PlayerGroup>();
      for (const row of logsData ?? []) {
        const rosterInfo = rosterById.get(row.player_id);
        const relation = row.players as
          | { name?: string; team_name?: string; is_eliminated?: boolean }[]
          | { name?: string; team_name?: string; is_eliminated?: boolean }
          | null;
        const playerInfo = Array.isArray(relation) ? relation[0] : relation;

        const entry: LogEntry = {
          id: row.id,
          logDate: row.log_date,
          minutesLogged: row.minutes_logged ?? 0,
        };

        const existing = byPlayer.get(row.player_id);
        if (existing) {
          existing.entries.push(entry);
          existing.totalMinutes += entry.minutesLogged;
        } else {
          byPlayer.set(row.player_id, {
            playerId: row.player_id,
            playerName: rosterInfo?.name ?? playerInfo?.name ?? "Jugador",
            teamName: rosterInfo?.teamName ?? playerInfo?.team_name ?? null,
            isEliminated: rosterInfo?.isEliminated ?? Boolean(playerInfo?.is_eliminated),
            totalMinutes: entry.minutesLogged,
            entries: [entry],
          });
        }
      }

      setGroups(Array.from(byPlayer.values()));

      const drafts: Record<string, string> = {};
      for (const group of byPlayer.values()) {
        for (const entry of group.entries) {
          drafts[entry.id] = String(entry.minutesLogged);
        }
      }
      setDrafts(drafts);
      setIsLoading(false);
    }

    fetchWeekData();

    return () => {
      isCurrent = false;
    };
  }, [weekRange, reloadKey]);

  function refresh() {
    setReloadKey((prev) => prev + 1);
  }

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

      setSaveStates((prev) => ({ ...prev, [logId]: "saved" }));
      refresh();
      await processCompletedWeeks();
    } catch {
      setSaveStates((prev) => ({ ...prev, [logId]: "error" }));
    }
  }

  async function handleDelete(logId: string) {
    if (!adminSecret) {
      setSaveStates((prev) => ({ ...prev, [logId]: "error" }));
      return;
    }

    if (!window.confirm("¿Borrar esta captura? Esta accion no se puede deshacer.")) {
      return;
    }

    setSaveStates((prev) => ({ ...prev, [logId]: "saving" }));

    try {
      const response = await fetch("/api/admin", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ log_id: logId }),
      });

      if (!response.ok) {
        throw new Error("No se pudo borrar.");
      }

      refresh();
    } catch {
      setSaveStates((prev) => ({ ...prev, [logId]: "error" }));
    }
  }

  async function handleManualSubmit() {
    if (!adminSecret) {
      setManualState("error");
      setManualMessage("Falta la clave de admin.");
      return;
    }

    if (!manualPlayerId || !manualDay) {
      setManualState("error");
      setManualMessage("Elegí jugador y día.");
      return;
    }

    const minutesValue = Number(manualMinutes);
    if (!Number.isFinite(minutesValue) || minutesValue < 0) {
      setManualState("error");
      setManualMessage("Minutos inválidos.");
      return;
    }

    setManualState("saving");
    setManualMessage("");

    try {
      const response = await fetch("/api/admin/manual-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          player_id: manualPlayerId,
          log_date: manualDay,
          minutes_logged: Math.round(minutesValue),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo guardar.");
      }

      setManualState("saved");
      setManualMessage(
        `Guardado: ${formatMinutesToTime(data.dailyLog?.minutes_logged ?? minutesValue)}`
      );
      setManualMinutes("");
      refresh();
      await processCompletedWeeks();
    } catch (error) {
      setManualState("error");
      setManualMessage(error instanceof Error ? error.message : "Error desconocido.");
    }
  }

  const sortedGroups = [...groups].sort((a, b) => a.totalMinutes - b.totalMinutes);
  const pendingPlayers = roster
    .map((player) => {
      const group = groups.find((g) => g.playerId === player.id);
      const loggedDates = new Set((group?.entries ?? []).map((entry) => entry.logDate));
      const missingDays = weekDays.filter((day) => !loggedDates.has(day));
      return { player, missingDays };
    })
    .filter(({ missingDays }) => missingDays.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <ShieldCheck className="h-4 w-4" />
          Panel de Admin
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

        <div className="mb-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            aria-label="Semana anterior"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-medium">
            {isCurrentWeek ? "Esta semana" : "Semana"} ({formatRangeLabel(weekRange)})
          </span>
          <button
            type="button"
            aria-label="Semana siguiente"
            disabled={!canGoNext}
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="rounded-md p-1 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-zinc-400">Cargando...</p>
        ) : sortedGroups.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            No hay registros esta semana.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
            {sortedGroups.map((group, index) => {
              const isExpanded = Boolean(expanded[group.playerId]);
              return (
                <li key={group.playerId} className="py-3 text-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [group.playerId]: !prev[group.playerId] }))
                    }
                    className="flex w-full items-center justify-between text-left"
                  >
                    <span className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                      <span className="font-semibold text-zinc-400">#{index + 1}</span>
                      {group.isEliminated && <Skull className="h-4 w-4" />}
                      <span className="flex flex-col">
                        <span>{group.playerName}</span>
                        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                          {group.teamName ?? "Sin equipo"} · {group.entries.length}/7 días
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                      {formatMinutesToTime(group.totalMinutes)}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                    <ul className="mt-3 flex flex-col gap-2 border-l-2 border-zinc-100 pl-3 dark:border-zinc-800">
                      {group.entries
                        .slice()
                        .sort((a, b) => a.logDate.localeCompare(b.logDate))
                        .map((entry) => {
                          const saveState = saveStates[entry.id] ?? "idle";
                          return (
                            <li key={entry.id} className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {formatDayLabel(entry.logDate)}
                              </span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={drafts[entry.id] ?? ""}
                                  onChange={(event) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [entry.id]: event.target.value,
                                    }))
                                  }
                                  className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSave(entry.id)}
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
                                <button
                                  type="button"
                                  onClick={() => handleDelete(entry.id)}
                                  disabled={saveState === "saving"}
                                  className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Eliminar
                                </button>
                                {saveState === "saved" && (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                )}
                                {saveState === "error" && (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingPlayers.length > 0 && (
        <div className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <h3 className="mb-2 font-semibold text-amber-800 dark:text-amber-200">
            Pendientes de esta semana
          </h3>
          <ul className="flex flex-col gap-1 text-xs text-amber-800 dark:text-amber-200">
            {pendingPlayers.map(({ player, missingDays }) => (
              <li key={player.id}>
                <span className="font-medium">{player.name}</span>: le falta{" "}
                {missingDays.map((day) => formatDayLabel(day)).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <PlusCircle className="h-4 w-4" />
          Cargar minutos manual
        </h3>
        <div className="flex flex-col gap-2">
          <select
            value={manualPlayerId}
            onChange={(event) => setManualPlayerId(event.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Jugador...</option>
            {roster
              .filter((player) => !player.isEliminated)
              .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
          </select>

          <select
            value={manualDay}
            onChange={(event) => setManualDayOverride(event.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {weekDays.map((day) => (
              <option key={day} value={day}>
                {formatDayLabel(day)}
              </option>
            ))}
          </select>

          <input
            type="number"
            min={0}
            value={manualMinutes}
            onChange={(event) => setManualMinutes(event.target.value)}
            placeholder="Minutos"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />

          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={manualState === "saving"}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {manualState === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>

          {manualState === "saved" && (
            <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              {manualMessage}
            </p>
          )}
          {manualState === "error" && (
            <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" />
              {manualMessage}
            </p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Si ese jugador ya tenía un valor cargado para ese día, esto lo reemplaza (no lo suma).
          </p>
        </div>
      </div>
    </div>
  );
}
