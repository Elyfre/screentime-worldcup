"use client";

import { useState, type FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getStoredPlayer } from "@/lib/player";

type ChatMessage = {
  id: string;
  playerName: string;
  content: string;
};

export default function LiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const player = getStoredPlayer();
    const trimmed = content.trim();
    if (!player || !trimmed) return;

    setSending(true);

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ player_id: player.id, content: trimmed })
      .select()
      .single();

    setSending(false);

    if (error || !data) return;

    setMessages((prev) => [
      ...prev,
      { id: data.id, playerName: player.name, content: data.content },
    ]);
    setContent("");
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
        {/* TODO: suscribirse a Supabase Realtime sobre chat_messages */}
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-400">Aún no hay mensajes.</p>
        ) : (
          messages.map((message) => (
            <p key={message.id} className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                {message.playerName}:
              </span>{" "}
              {message.content}
            </p>
          ))
        )}
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
