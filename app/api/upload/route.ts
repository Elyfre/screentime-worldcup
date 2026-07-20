import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";
import { analyzeScreenTimeImage } from "@/lib/gemini";
import { getArgentinaNow, getPreviousWeekRange, getWeekRange, toDateKey } from "@/lib/week";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const playerId = formData.get("playerId");
    const manualMinutesRaw = formData.get("manualMinutes");
    const logDateRaw = formData.get("logDate");

    if (!(file instanceof File) || typeof playerId !== "string" || !playerId) {
      return NextResponse.json(
        { error: "Se requiere 'file' (imagen) y 'playerId'." },
        { status: 400 }
      );
    }

    if (typeof logDateRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(logDateRaw)) {
      return NextResponse.json(
        { error: "Se requiere 'logDate' (dia al que corresponde la captura)." },
        { status: 400 }
      );
    }

    const argentinaNow = getArgentinaNow();
    const todayKey = toDateKey(argentinaNow);
    const weekRange = getWeekRange(argentinaNow);
    const previousWeekRange = getPreviousWeekRange(argentinaNow);

    // Se permite la semana actual (hasta hoy) y la semana anterior completa,
    // para poder cargar dias que quedaron pendientes al arrancar la semana nueva.
    const isInCurrentWeek = logDateRaw <= todayKey && logDateRaw >= weekRange.start;
    const isInPreviousWeek =
      logDateRaw >= previousWeekRange.start && logDateRaw <= previousWeekRange.end;

    if (!isInCurrentWeek && !isInPreviousWeek) {
      return NextResponse.json(
        { error: "El dia seleccionado no es valido." },
        { status: 400 }
      );
    }

    const logDate = logDateRaw;

    const { data: playerRow, error: playerError } = await supabase
      .from("players")
      .select("is_eliminated")
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) {
      console.error("[/api/upload] Supabase players lookup error:", playerError);
      return NextResponse.json({ error: playerError.message }, { status: 500 });
    }

    if (playerRow?.is_eliminated) {
      return NextResponse.json(
        { error: "Fuiste eliminado, ya no podés subir capturas." },
        { status: 403 }
      );
    }

    const manualMinutes = Math.max(0, Number(manualMinutesRaw) || 0);

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";
    const extension = file.name.split(".").pop() || "jpg";
    const fileName = `${playerId}/${randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("screenshots")
      .upload(fileName, buffer, { contentType: mimeType });

    if (uploadError) {
      console.error("[/api/upload] Supabase Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("screenshots").getPublicUrl(fileName);

    const minutesFromScreenshot = await analyzeScreenTimeImage(
      buffer.toString("base64"),
      mimeType
    );
    const minutesLogged = minutesFromScreenshot + manualMinutes;

    const { data: dailyLog, error: insertError } = await supabase
      .from("daily_logs")
      .insert({
        player_id: playerId,
        log_date: logDate,
        screenshot_url: publicUrl,
        minutes_logged: minutesLogged,
      })
      .select()
      .single();

    if (insertError) {
      // 23505 = unique_violation (constraint daily_logs_player_id_log_date_key).
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya subiste una captura para ese día. Si necesitás corregirla, pedile a un admin que la borre en el Panel de Admin.",
          },
          { status: 409 }
        );
      }
      console.error("[/api/upload] Supabase daily_logs insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, dailyLog });
  } catch (error) {
    console.error("[/api/upload] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
