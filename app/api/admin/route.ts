import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const providedSecret = request.headers.get("x-admin-secret");
    if (!providedSecret || providedSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const body = await request.json();
    const { log_id: logId, new_minutes: newMinutes } = body;

    if (typeof logId !== "string" || typeof newMinutes !== "number" || !Number.isFinite(newMinutes)) {
      return NextResponse.json(
        { error: "Se requiere 'log_id' (string) y 'new_minutes' (number)." },
        { status: 400 }
      );
    }

    const { data: dailyLog, error } = await supabase
      .from("daily_logs")
      .update({ minutes_logged: Math.max(0, Math.round(newMinutes)) })
      .eq("id", logId)
      .select()
      .single();

    if (error) {
      console.error("[/api/admin] Supabase daily_logs update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, dailyLog });
  } catch (error) {
    console.error("[/api/admin] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
