const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";

/** "Ahora" con los campos de calendario (año, mes, día, hora...) en horario de Argentina. */
export function getArgentinaNow(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARGENTINA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  return new Date(
    values.year,
    values.month - 1,
    values.day,
    values.hour === 24 ? 0 : values.hour,
    values.minute,
    values.second
  );
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Devuelve el domingo 23:59:00 de la semana (lunes-domingo) en la que cae `now`. */
export function getWeekCutoff(now: Date): Date {
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() + daysUntilSunday);
  cutoff.setHours(23, 59, 0, 0);
  return cutoff;
}

/** Rango lunes-domingo (inclusive) de la semana en la que cae `now`, como 'YYYY-MM-DD'. */
export function getWeekRange(now: Date): { start: string; end: string } {
  const day = now.getDay(); // 0 = domingo
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { start: toDateKey(monday), end: toDateKey(sunday) };
}

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/**
 * Días elegibles para subir captura: de lunes de la semana actual hasta `now`
 * inclusive (nunca días futuros, para que nadie cargue un día que todavía no pasó).
 */
export function getSelectableDays(now: Date): { value: string; label: string }[] {
  const { start } = getWeekRange(now);
  const [year, month, day] = start.split("-").map(Number);
  const monday = new Date(year, month - 1, day);
  const todayKey = toDateKey(now);

  const days: { value: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const value = toDateKey(date);
    if (value > todayKey) break;
    days.push({
      value,
      label: `${DAY_LABELS[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
    });
  }
  return days;
}
