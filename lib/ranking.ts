export type PlayerRelation =
  | { name?: string; team_name?: string }[]
  | { name?: string; team_name?: string }
  | null;

export type DailyLogRow = {
  player_id: string;
  minutes_logged: number | null;
  players: PlayerRelation;
};

export type PlayerWeeklyTotal = {
  id: string;
  name: string;
  teamName: string | null;
  totalMinutes: number;
  daysLogged: number;
};

/** Agrupa filas de daily_logs (con el join a players) sumando minutos por jugador. */
export function groupLogsByPlayer(rows: DailyLogRow[]): PlayerWeeklyTotal[] {
  const totals = rows.reduce<Record<string, PlayerWeeklyTotal>>((acc, row) => {
    const minutes = row.minutes_logged ?? 0;
    const playerInfo = Array.isArray(row.players) ? row.players[0] : row.players;
    const key = row.player_id;

    if (acc[key]) {
      acc[key].totalMinutes += minutes;
      acc[key].daysLogged += 1;
    } else {
      acc[key] = {
        id: key,
        name: playerInfo?.name ?? "Jugador",
        teamName: playerInfo?.team_name ?? null,
        totalMinutes: minutes,
        daysLogged: 1,
      };
    }
    return acc;
  }, {});

  return Object.values(totals);
}

/** Menos tiempo = mejor puesto, por eso se ordena ascendente. */
export function sortByLessTimeFirst(totals: PlayerWeeklyTotal[]): PlayerWeeklyTotal[] {
  return [...totals].sort((a, b) => a.totalMinutes - b.totalMinutes);
}

/** Los `count` jugadores con MAS minutos (al final del array ascendente) quedan eliminados. */
export function getEliminatedIds(sortedAscending: PlayerWeeklyTotal[], count = 2): Set<string> {
  return new Set(sortedAscending.slice(-count).map((player) => player.id));
}
