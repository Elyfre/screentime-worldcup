import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";
import { analyzeScreenTimeImage } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const playerId = formData.get("playerId");
    const manualMinutesRaw = formData.get("manualMinutes");

    if (!(file instanceof File) || typeof playerId !== "string" || !playerId) {
      return NextResponse.json(
        { error: "Se requiere 'file' (imagen) y 'playerId'." },
        { status: 400 }
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

    // Zona horaria fija en Argentina: evita que el "día" cambie según la hora UTC del servidor.
    const logDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const { error: deleteError } = await supabase
      .from("daily_logs")
      .delete()
      .eq("player_id", playerId)
      .eq("log_date", logDate);

    if (deleteError) {
      console.error("[/api/upload] Supabase daily_logs delete error:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

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
