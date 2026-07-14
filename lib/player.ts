export type Player = {
  id: string;
  name: string;
  team_name: string;
};

export const PLAYER_STORAGE_KEY = "screentime-worldcup:player";

export function getStoredPlayer(): Player | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Player;
  } catch {
    return null;
  }
}

export function storePlayer(player: Player): void {
  localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
}
