import { supabase } from "./supabase";
import { getArgentinaNow, getWeekRange, shiftDateByWeeks, toDateKey, parseDateKey } from "./week";

/** Usado solo si la tabla players estuviera vacía (no debería pasar en la práctica). */
const TOURNAMENT_FALLBACK_START = "2026-07-13";

async function getTournamentStartWeekKey(): Promise<string> {
  const { data } = await supabase
    .from("players")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.created_at) return TOURNAMENT_FALLBACK_START;
  return getWeekRange(new Date(data.created_at)).start;
}

/**
 * Recorre semana por semana desde el inicio del torneo. Si una semana ya
 * terminó (su domingo ya pasó) y todos los jugadores activos cargaron sus 7
 * días, marca automáticamente a los 2 con más minutos como eliminados
 * (is_eliminated + eliminated_week_start). Se detiene en la primera semana
 * que todavía no terminó o que terminó pero está incompleta.
 *
 * Pensado para llamarse "fire and forget" al cargar la app: no hay cron,
 * así que cualquier carga de la app es una oportunidad de detectar que una
 * semana quedó completa y cerrarla.
 */
export async function processCompletedWeeks(): Promise<void> {
  const todayKey = toDateKey(getArgentinaNow());

  const { data: playersData } = await supabase
    .from("players")
    .select("id, is_eliminated, eliminated_week_start");

  if (!playersData || playersData.length === 0) return;

  let activeIds = playersData.filter((p) => !p.is_eliminated).map((p) => p.id as string);

  const processedWeekStarts = new Set(
    playersData
      .map((p) => p.eliminated_week_start as string | null)
      .filter((value): value is string => Boolean(value))
  );

  let weekStartKey = await getTournamentStartWeekKey();

  // Nunca elimina hasta dejar 2 o menos jugadores activos: en ese punto son
  // los finalistas y cerrar más semanas automáticamente no tiene sentido.
  while (activeIds.length > 2) {
    const weekRange = getWeekRange(parseDateKey(weekStartKey));
    if (weekRange.end >= todayKey) break;

    if (processedWeekStarts.has(weekStartKey)) {
      weekStartKey = toDateKey(shiftDateByWeeks(parseDateKey(weekStartKey), 1));
      continue;
    }

    const { data: logs } = await supabase
      .from("daily_logs")
      .select("player_id, minutes_logged, log_date")
      .in("player_id", activeIds)
      .gte("log_date", weekRange.start)
      .lte("log_date", weekRange.end);

    const byPlayer = new Map<string, { count: number; total: number }>();
    for (const id of activeIds) byPlayer.set(id, { count: 0, total: 0 });
    for (const log of logs ?? []) {
      const entry = byPlayer.get(log.player_id);
      if (!entry) continue;
      entry.count += 1;
      entry.total += log.minutes_logged ?? 0;
    }

    const isComplete = activeIds.every((id) => (byPlayer.get(id)?.count ?? 0) >= 7);
    if (!isComplete) break;

    const sortedAscending = [...byPlayer.entries()].sort((a, b) => a[1].total - b[1].total);
    const eliminatedIds = sortedAscending.slice(-2).map(([id]) => id);

    await supabase
      .from("players")
      .update({ is_eliminated: true, eliminated_week_start: weekStartKey })
      .in("id", eliminatedIds);

    activeIds = activeIds.filter((id) => !eliminatedIds.includes(id));
    processedWeekStarts.add(weekStartKey);
    weekStartKey = toDateKey(shiftDateByWeeks(parseDateKey(weekStartKey), 1));
  }
}
