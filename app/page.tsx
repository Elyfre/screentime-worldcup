"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import UploadForm from "@/components/UploadForm";
import DailyStatus from "@/components/DailyStatus";
import Leaderboard from "@/components/Leaderboard";
import LiveChat from "@/components/LiveChat";
import Onboarding from "@/components/Onboarding";
import AdminPanel from "@/components/AdminPanel";
import { getStoredPlayer, type Player } from "@/lib/player";

type Tab = "progress" | "leaderboard";
type View = "dashboard" | "admin";

const ADMIN_NAME = "Elias";

export default function Home() {
  const [player, setPlayer] = useState<Player | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("progress");
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<View>("dashboard");

  useEffect(() => {
    const timeout = setTimeout(() => setPlayer(getStoredPlayer()), 0);
    return () => clearTimeout(timeout);
  }, []);

  if (player === undefined) {
    return null;
  }

  if (!player) {
    return <Onboarding onComplete={setPlayer} />;
  }

  const isAdmin = player.name === ADMIN_NAME;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            🏆 ScreenTime WorldCup
          </h1>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setView((prev) => (prev === "admin" ? "dashboard" : "admin"))}
              className="flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <ShieldCheck className="h-3 w-3" />
              {view === "admin" ? "Volver" : "Panel de Admin"}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-4 pb-8">
        {view === "admin" ? (
          <AdminPanel />
        ) : (
          <>
            <UploadForm onUploadSuccess={() => setRefreshKey((prev) => prev + 1)} />

            <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setTab("progress")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "progress"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                Progreso
              </button>
              <button
                type="button"
                onClick={() => setTab("leaderboard")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === "leaderboard"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                Ranking
              </button>
            </div>

            {tab === "progress" ? (
              <DailyStatus refreshKey={refreshKey} />
            ) : (
              <Leaderboard refreshKey={refreshKey} />
            )}
          </>
        )}
      </main>

      <LiveChat />
    </div>
  );
}
