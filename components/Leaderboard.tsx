"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy, Skull, Clock, EyeOff, Hourglass } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatMinutesToTime } from "@/lib/utils";
import { getArgentinaNow, getWeekCutoff, getWeekRange, shiftDateByWeeks, toDateKey } from "@/lib/week";
import {
  groupLogsByPlayer,
  sortByLessTimeFirst,
  getEliminatedIds,
  type DailyLogRow,
  type PlayerWeeklyTotal,
} from "@/lib/ranking";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours.toString().padStart(2, "0")}h ${minutes
    .toString()
    .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatRangeLabel(range: { start: string; end: string }): string {
  const format = (key: string) => {
    const [, month, day] = key.split("-");
    return `${day}/${month}`;
  };
  return `${format(range.start)} - ${format(range.end)}`;
}

type Props = {
  refreshKey?: number;
};

export default function Leaderboard({ refreshKey }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [ranking, setRanking] = useState<PlayerWeeklyTotal[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);
  const [isWeekComplete, setIsWeekComplete] = useState(false);
  const [earliestWeekStart, setEarliestWeekStart] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setNow(getArgentinaNow());
    const timeout = setTimeout(update, 0);
    const interval = setInterval(update, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function fetchEarliest() {
      const { data } = await supabase
        .from("daily_logs")
        .select("log_date")
        .order("log_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!isCurrent) return;
      if (data?.log_date) setEarliestWeekStart(getWeekRange(new Date(data.log_date)).start);
    }

    fetchEarliest();

    return () => {
      isCurrent = false;
    };
  }, []);

  const nowDateKey = now ? toDateKey(now) : null;
  // Memoizado por día y por semana elegida (no por segundo) para no disparar el fetch en cada tick.
  const weekRange = useMemo(
    () => (now ? getWeekRange(shiftDateByWeeks(now, weekOffset)) : null),
    [nowDateKey, weekOffset] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const isCurrentWeek = weekOffset === 0;
  const cutoff = now && isCurrentWeek ? getWeekCutoff(now) : null;
  const cutoffPassed = !isCurrentWeek || (now !== null && cutoff !== null && now.getTime() >= cutoff.getTime());
  // Las semanas pasadas quedan siempre visibles como historial; la semana en
  // curso recien se revela cuando paso el corte Y todos cargaron los 7 dias.
  const isRevealed = !isCurrentWeek || (cutoffPassed && isWeekComplete);

  const canGoPrev = !earliestWeekStart || !weekRange || weekRange.start > earliestWeekStart;
  const canGoNext = weekOffset < 0;

  useEffect(() => {
    if (!weekRange) return;
    const range = weekRange;
    let isCurrent = true;

    async function fetchWeeklyRanking() {
      setIsLoadingRanking(true);

      const [{ data: logsData }, { data: activePlayers }] = await Promise.all([
        supabase
          .from("daily_logs")
          .select("player_id, minutes_logged, players(name, team_name)")
          .gte("log_date", range.start)
          .lte("log_date", range.end),
        supabase.from("players").select("id").eq("is_eliminated", false),
      ]);

      if (!isCurrent) return;

      const totals = groupLogsByPlayer((logsData ?? []) as unknown as DailyLogRow[]);
      setRanking(totals);

      const activeIds = (activePlayers ?? []).map((player) => player.id as string);
      const daysLoggedByPlayer = new Map(totals.map((total) => [total.id, total.daysLogged]));
      const complete =
        activeIds.length > 0 && activeIds.every((id) => (daysLoggedByPlayer.get(id) ?? 0) >= 7);
      setIsWeekComplete(complete);

      setIsLoadingRanking(false);
    }

    fetchWeeklyRanking();

    return () => {
      isCurrent = false;
    };
  }, [weekRange, refreshKey]);

  if (!now || !weekRange) return null;

  const header = (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <Trophy className="h-4 w-4" />
        Tabla de posiciones
      </h2>
      <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          aria-label="Semana anterior"
          disabled={!canGoPrev}
          onClick={() => setWeekOffset((prev) => prev - 1)}
          className="rounded-md p-1 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[5.5rem] text-center font-medium">
          {isCurrentWeek ? "Esta semana" : formatRangeLabel(weekRange)}
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
    </div>
  );

  if (!isRevealed) {
    return (
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {header}
        {cutoffPassed ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Hourglass className="h-8 w-8 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ranking pendiente de revelar
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Todavía faltan jugadores por cargar días de esta semana.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <EyeOff className="h-8 w-8 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tiempos ocultos
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Se revelan el domingo a las 23:59 (hora Argentina), si ya está todo cargado
            </p>
            <p className="mt-2 flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Clock className="h-3 w-3" />
              {cutoff ? formatCountdown(cutoff.getTime() - now.getTime()) : ""}
            </p>
          </div>
        )}
      </div>
    );
  }

  const sortedRanking = sortByLessTimeFirst(ranking);
  const eliminatedIds = getEliminatedIds(sortedRanking);

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {header}

      {isLoadingRanking ? (
        <p className="py-4 text-center text-sm text-zinc-400">Cargando...</p>
      ) : sortedRanking.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">
          Nadie registró tiempo esta semana.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {sortedRanking.map((player, index) => {
            const isEliminated = eliminatedIds.has(player.id);
            return (
              <li
                key={player.id}
                className={`flex items-center justify-between py-3 text-sm ${
                  isEliminated ? "opacity-50" : ""
                }`}
              >
                <span className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                  <span className="font-semibold text-zinc-400">#{index + 1}</span>
                  {isEliminated && <Skull className="h-4 w-4" />}
                  <span className="flex flex-col">
                    <span>{player.name}</span>
                    <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                      {player.teamName ?? "Sin equipo"}
                    </span>
                  </span>
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatMinutesToTime(player.totalMinutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
