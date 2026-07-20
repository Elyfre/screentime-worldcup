import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const providedSecret = request.headers.get("x-admin-secret");
    if (!providedSecret || providedSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const body = await request.json();
    const { player_id: playerId, log_date: logDate, minutes_logged: minutesLogged } = body;

    if (typeof playerId !== "string" || !playerId) {
      return NextResponse.json({ error: "Se requiere 'player_id' (string)." }, { status: 400 });
    }

    if (typeof logDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return NextResponse.json(
        { error: "Se requiere 'log_date' con formato YYYY-MM-DD." },
        { status: 400 }
      );
    }

    if (typeof minutesLogged !== "number" || !Number.isFinite(minutesLogged)) {
      return NextResponse.json(
        { error: "Se requiere 'minutes_logged' (number)." },
        { status: 400 }
      );
    }

    const { data: dailyLog, error } = await supabase
      .from("daily_logs")
      .upsert(
        {
          player_id: playerId,
          log_date: logDate,
          minutes_logged: Math.max(0, Math.round(minutesLogged)),
        },
        { onConflict: "player_id,log_date" }
      )
      .select()
      .single();

    if (error) {
      console.error("[/api/admin/manual-log] Supabase upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, dailyLog });
  } catch (error) {
    console.error("[/api/admin/manual-log] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
