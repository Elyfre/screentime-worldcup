"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy, Skull, Clock, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatMinutesToTime } from "@/lib/utils";
import { getArgentinaNow, getWeekCutoff, getWeekRange, toDateKey } from "@/lib/week";

type PlayerWeeklyTotal = {
  id: string;
  name: string;
  totalMinutes: number;
};

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

type Props = {
  refreshKey?: number;
};

export default function Leaderboard({ refreshKey }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [ranking, setRanking] = useState<PlayerWeeklyTotal[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);

  useEffect(() => {
    const update = () => setNow(getArgentinaNow());
    const timeout = setTimeout(update, 0);
    const interval = setInterval(update, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const cutoff = now ? getWeekCutoff(now) : null;
  const isRevealed = now !== null && cutoff !== null && now.getTime() >= cutoff.getTime();
  const nowDateKey = now ? toDateKey(now) : null;
  // Memoizado por día (no por segundo) para no disparar el fetch en cada tick del reloj.
  const weekRange = useMemo(() => (now ? getWeekRange(now) : null), [nowDateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isRevealed || !weekRange) return;
    const range = weekRange;

    let isCurrent = true;

    async function fetchWeeklyRanking() {
      setIsLoadingRanking(true);

      const { data } = await supabase
        .from("daily_logs")
        .select("player_id, minutes_logged, players(name)")
        .gte("log_date", range.start)
        .lte("log_date", range.end);

      if (!isCurrent) return;

      const totals = new Map<string, PlayerWeeklyTotal>();
      for (const row of data ?? []) {
        const minutes = row.minutes_logged ?? 0;
        const playersRelation = row.players as { name?: string }[] | { name?: string } | null;
        const playerName = Array.isArray(playersRelation)
          ? playersRelation[0]?.name
          : playersRelation?.name;
        const existing = totals.get(row.player_id);
        if (existing) {
          existing.totalMinutes += minutes;
        } else {
          totals.set(row.player_id, {
            id: row.player_id,
            name: playerName ?? "Jugador",
            totalMinutes: minutes,
          });
        }
      }

      setRanking(Array.from(totals.values()));
      setIsLoadingRanking(false);
    }

    fetchWeeklyRanking();

    return () => {
      isCurrent = false;
    };
  }, [isRevealed, weekRange, refreshKey]);

  if (!now || !cutoff) return null;

  if (!isRevealed) {
    return (
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <Trophy className="h-4 w-4" />
          Tabla de posiciones
        </h2>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <EyeOff className="h-8 w-8 text-zinc-400" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Tiempos ocultos
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Se revelan el domingo a las 23:59 (hora Argentina)
          </p>
          <p className="mt-2 flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <Clock className="h-3 w-3" />
            {formatCountdown(cutoff.getTime() - now.getTime())}
          </p>
        </div>
      </div>
    );
  }

  const sortedRanking = [...ranking].sort((a, b) => a.totalMinutes - b.totalMinutes);
  const eliminatedId =
    sortedRanking.length > 0
      ? sortedRanking.reduce((max, player) =>
          player.totalMinutes > max.totalMinutes ? player : max
        ).id
      : null;

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <Trophy className="h-4 w-4" />
        Tabla de posiciones
      </h2>

      {isLoadingRanking ? (
        <p className="py-4 text-center text-sm text-zinc-400">Cargando...</p>
      ) : sortedRanking.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">
          Nadie registró tiempo esta semana.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {sortedRanking.map((player, index) => {
            const isEliminated = player.id === eliminatedId;
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
                  {player.name}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {isEliminated ? "Eliminado" : formatMinutesToTime(player.totalMinutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
