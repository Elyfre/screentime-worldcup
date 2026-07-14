"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { storePlayer, type Player } from "@/lib/player";

const SELECCIONES = [
  "México",
  "Sudáfrica",
  "Suiza",
  "Canadá",
  "Bosnia y Herzegovina",
  "Brasil",
  "Marruecos",
  "Estados Unidos",
  "Australia",
  "Paraguay",
  "Alemania",
  "Costa de Marfil",
  "Ecuador",
  "Países Bajos",
  "Japón",
  "Suecia",
  "Bélgica",
  "Egipto",
  "España",
  "Cabo Verde",
  "Francia",
  "Noruega",
  "Senegal",
  "Argentina",
  "Austria",
  "Argelia",
  "Colombia",
  "Portugal",
  "R. D. del Congo",
  "Inglaterra",
  "Croacia",
  "Ghana",
];

type Props = {
  onComplete: (player: Player) => void;
};

export default function Onboarding({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [takenTeams, setTakenTeams] = useState<Set<string>>(new Set());
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function fetchTakenTeams() {
      const { data } = await supabase.from("players").select("team_name");
      if (!isCurrent) return;

      const taken = new Set(
        (data ?? [])
          .map((row) => row.team_name)
          .filter((team): team is string => Boolean(team))
      );
      const firstAvailable = SELECCIONES.find((team) => !taken.has(team));

      setTakenTeams(taken);
      setTeamName(firstAvailable ?? "");
      setIsLoadingTeams(false);
    }

    fetchTakenTeams();

    return () => {
      isCurrent = false;
    };
  }, []);

  const noTeamsAvailable = !isLoadingTeams && teamName === "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Ingresa tu nombre.");
      return;
    }

    if (!teamName || takenTeams.has(teamName)) {
      setError("Elige una selección disponible.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("players")
      .insert({ name: trimmedName, team_name: teamName })
      .select()
      .single();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "No se pudo registrar el jugador.");
      return;
    }

    const player: Player = {
      id: data.id,
      name: data.name,
      team_name: data.team_name,
    };

    storePlayer(player);
    onComplete(player);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-center text-lg font-bold text-zinc-900 dark:text-zinc-50">
          🏆 ScreenTime WorldCup
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Regístrate para unirte al torneo
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="name"
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Nombre
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tu nombre"
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="team"
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Selección
            </label>
            {isLoadingTeams ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                Cargando selecciones disponibles...
              </p>
            ) : (
              <select
                id="team"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {SELECCIONES.map((seleccion) => {
                  const isTaken = takenTeams.has(seleccion);
                  return (
                    <option key={seleccion} value={seleccion} disabled={isTaken}>
                      {seleccion}
                      {isTaken ? " (Ya elegido)" : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || isLoadingTeams || noTeamsAvailable}
            className="mt-2 w-full rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Registrando..." : "Unirme al torneo"}
          </button>

          {noTeamsAvailable && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Ya no quedan selecciones disponibles.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
