"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getStoredPlayer } from "@/lib/player";

type ChatMessageRow = {
  id: string;
  player_id: string;
  content: string;
  created_at: string;
};

type PlayerInfo = {
  name: string;
  teamName: string | null;
};

type ChatMessage = ChatMessageRow & PlayerInfo;

export default function LiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  // Cache de player_id -> {nombre, equipo}, para no tener que hacer un join en cada mensaje en vivo.
  const playerInfoRef = useRef<Map<string, PlayerInfo>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  function resolvePlayerInfo(playerId: string): PlayerInfo {
    return playerInfoRef.current.get(playerId) ?? { name: "Jugador", teamName: null };
  }

  // Historial: trae todos los jugadores (para resolver nombre + equipo) y todos los mensajes.
  useEffect(() => {
    let isCurrent = true;

    async function loadHistory() {
      const { data: players } = await supabase.from("players").select("id, name, team_name");
      if (!isCurrent) return;

      const infoMap = new Map<string, PlayerInfo>();
      for (const player of players ?? []) {
        infoMap.set(player.id, { name: player.name, teamName: player.team_name ?? null });
      }
      playerInfoRef.current = infoMap;

      const { data: history } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (!isCurrent) return;

      setMessages(
        (history ?? []).map((row: ChatMessageRow) => ({
          ...row,
          ...resolvePlayerInfo(row.player_id),
        }))
      );
    }

    loadHistory();

    return () => {
      isCurrent = false;
    };
  }, []);

  // Realtime: cualquier INSERT nuevo en chat_messages se agrega al estado local.
  useEffect(() => {
    const channel = supabase
      .channel("public:chat_messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          setMessages((prev) => [...prev, { ...row, ...resolvePlayerInfo(row.player_id) }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll al último mensaje cada vez que la lista cambia.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const player = getStoredPlayer();
    const trimmed = content.trim();
    if (!player || !trimmed) return;

    setSending(true);

    // No agregamos el mensaje al estado acá: lo hace la suscripción de Realtime
    // cuando detecta el INSERT, así evitamos duplicarlo en la pantalla del autor.
    const { error } = await supabase
      .from("chat_messages")
      .insert({ player_id: player.id, content: trimmed });

    setSending(false);

    if (!error) {
      setContent("");
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir chat en vivo"
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition-colors hover:bg-orange-600"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-[70vh] flex-col rounded-t-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Chat en vivo
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Cerrar chat"
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-400">Aún no hay mensajes.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                {message.name}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {message.teamName ?? "Sin equipo"}
              </span>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{message.content}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
      >
        <input
          type="text"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="submit"
          disabled={sending}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
