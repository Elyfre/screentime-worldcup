"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { getStoredPlayer } from "@/lib/player";
import { formatMinutesToTime } from "@/lib/utils";
import { getArgentinaNow, getSelectableDays } from "@/lib/week";
import { supabase } from "@/lib/supabase";

type Status = "idle" | "loading" | "success" | "error";

function getFriendlyUploadErrorMessage(rawMessage: string): string {
  // Ya viene en español y prolijo: todos los modelos de fallback de Gemini se saturaron.
  if (rawMessage.includes("Todos los modelos de IA están saturados")) {
    return rawMessage;
  }

  const normalized = rawMessage.toLowerCase();
  const isOverloaded =
    normalized.includes("503") ||
    normalized.includes("high demand") ||
    normalized.includes("service unavailable");

  if (isOverloaded) {
    return "El servidor de IA está procesando muchas solicitudes. Por favor, esperá unos segundos y volvé a intentar.";
  }

  return "Hubo un error al procesar la imagen. Intentá de nuevo.";
}

type Props = {
  onUploadSuccess?: () => void;
};

export default function UploadForm({ onUploadSuccess }: Props) {
  const selectableDays = useMemo(() => getSelectableDays(getArgentinaNow()), []);
  const [file, setFile] = useState<File | null>(null);
  const [manualMinutes, setManualMinutes] = useState(0);
  const [logDate, setLogDate] = useState(
    () => selectableDays[selectableDays.length - 1]?.value ?? ""
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [existingMinutes, setExistingMinutes] = useState<number | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);

  useEffect(() => {
    setPlayerId(getStoredPlayer()?.id ?? null);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function checkExistingLog() {
      if (!playerId || !logDate) return;
      setIsCheckingExisting(true);
      const { data } = await supabase
        .from("daily_logs")
        .select("minutes_logged")
        .eq("player_id", playerId)
        .eq("log_date", logDate)
        .maybeSingle();

      if (!isCurrent) return;
      setExistingMinutes(data?.minutes_logged ?? null);
      setIsCheckingExisting(false);
    }

    checkExistingLog();

    return () => {
      isCurrent = false;
    };
  }, [playerId, logDate, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const player = getStoredPlayer();
    if (!player) {
      setStatus("error");
      setMessage("No se encontró tu registro. Vuelve a la pantalla de inicio.");
      return;
    }

    if (!file) {
      setStatus("error");
      setMessage("Selecciona una captura antes de enviar.");
      return;
    }

    if (!logDate) {
      setStatus("error");
      setMessage("Selecciona a que dia corresponde la captura.");
      return;
    }

    if (existingMinutes !== null) {
      setStatus("error");
      setMessage("Ya subiste una captura para ese dia.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("playerId", player.id);
    formData.append("manualMinutes", String(manualMinutes));
    formData.append("logDate", logDate);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo procesar la captura.");
      }

      const minutesLogged = data.dailyLog?.minutes_logged;
      setStatus("success");
      setMessage(
        `¡Captura registrada! Tiempo: ${
          typeof minutesLogged === "number" ? formatMinutesToTime(minutesLogged) : "?"
        }`
      );
      setFile(null);
      setManualMinutes(0);
      onUploadSuccess?.();
    } catch (error) {
      setStatus("error");
      const rawMessage = error instanceof Error ? error.message : "";
      setMessage(getFriendlyUploadErrorMessage(rawMessage));
    }
  }

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Sube tu captura
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="logDate"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            ¿De que dia es esta captura?
          </label>
          <select
            id="logDate"
            value={logDate}
            onChange={(event) => setLogDate(event.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {selectableDays.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>

        {existingMinutes !== null ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Ya subiste tu captura de ese dia: {formatMinutesToTime(existingMinutes)}. Si esta
            mal, pedile a un admin que la borre en el Panel de Admin.
          </p>
        ) : (
          <>
            <label
              htmlFor="screenshot"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 py-8 text-zinc-500 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm">
                {file ? file.name : "Toca para subir tu captura"}
              </span>
              <input
                id="screenshot"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="manualMinutes"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                Tiempo extra en PC/Otros (minutos)
              </label>
              <input
                id="manualMinutes"
                type="number"
                min={0}
                value={manualMinutes}
                onChange={(event) =>
                  setManualMinutes(Math.max(0, Number(event.target.value) || 0))
                }
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading" || isCheckingExisting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === "loading" ? "Analizando..." : "Enviar captura"}
            </button>
          </>
        )}

        {status === "success" && (
          <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </p>
        )}
        {status === "error" && (
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <XCircle className="h-4 w-4" />
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
