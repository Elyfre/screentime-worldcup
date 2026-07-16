"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getStoredPlayer } from "@/lib/player";
import { formatMinutesToTime } from "@/lib/utils";
import { getArgentinaNow, toDateKey } from "@/lib/week";

type PlayerDailyStatus = {
  id: string;
  name: string;
  teamName: string | null;
  hasUploadedToday: boolean;
  minutesLogged: number | null;
};

type Props = {
  refreshKey?: number;
};

export default function DailyStatus({ refreshKey }: Props) {
  const [players, setPlayers] = useState<PlayerDailyStatus[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function fetchDailyStatus() {
      const currentPlayer = getStoredPlayer();
      const logDate = toDateKey(getArgentinaNow());

      const { data } = await supabase
        .from("players")
        .select("id, name, team_name, daily_logs!left(minutes_logged, log_date)")
        .eq("daily_logs.log_date", logDate)
        .order("name");

      if (!isCurrent) return;

      const status: PlayerDailyStatus[] = (data ?? []).map((row) => {
        const log = row.daily_logs?.[0];
        return {
          id: row.id,
          name: row.name,
          teamName: row.team_name ?? null,
          hasUploadedToday: Boolean(log),
          minutesLogged: log?.minutes_logged ?? null,
        };
      });

      setPlayers(status);
      setCurrentUserId(currentPlayer?.id ?? null);
      setIsLoading(false);
    }

    fetchDailyStatus();

    return () => {
      isCurrent = false;
    };
  }, [refreshKey]);

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <CalendarCheck className="h-4 w-4" />
        Estado de hoy
      </h2>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        Ves tus propios minutos. Los del resto de los competidores permanecen ocultos.
      </p>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-zinc-400">Cargando...</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {players.map((player) => {
            const isCurrentUser = player.id === currentUserId;
            return (
              <li
                key={player.id}
                className="flex items-center justify-between py-3 text-sm text-zinc-800 dark:text-zinc-200"
              >
                <span className="flex flex-col">
                  <span>{player.name}</span>
                  <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                    {player.teamName ?? "Sin equipo"}
                  </span>
                </span>
                {isCurrentUser && player.hasUploadedToday ? (
                  <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    Tu tiempo:{" "}
                    {player.minutesLogged !== null
                      ? formatMinutesToTime(player.minutesLogged)
                      : "?"}
                  </span>
                ) : player.hasUploadedToday ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
