import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY!;

export const genAI = new GoogleGenerativeAI(apiKey);

const SCREEN_TIME_PROMPT =
  "Analiza esta captura de pantalla de tiempo de uso de celular. Extrae el tiempo total de uso mostrado. " +
  "Convierte ese tiempo a minutos totales (por ejemplo, 1 hora 30 minutos = 90). " +
  "Devuelve ÚNICAMENTE un objeto JSON válido con una sola clave 'minutes' que contenga el número entero. " +
  "No devuelvas markdown, ni texto adicional, solo el JSON.";

// Probados en vivo (llamada real de generateContent) contra la API key del
// proyecto: aparecer en ListModels no garantiza acceso real (ver gemini-2.5-flash).
const fallbackModels = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];

// Errores de disponibilidad del modelo (saturado, retirado, rate limit) ameritan
// probar el siguiente modelo de la lista. Cualquier otro error (formato inválido,
// respuesta ilegible) aborta el proceso inmediatamente.
function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("503") ||
    normalized.includes("service unavailable") ||
    normalized.includes("high demand") ||
    normalized.includes("429") ||
    normalized.includes("too many requests") ||
    normalized.includes("quota") ||
    normalized.includes("404") ||
    normalized.includes("no longer available") ||
    normalized.includes("not found")
  );
}

function extractJson(rawText: string): string {
  // Gemini a veces envuelve la respuesta en ```json ... ``` o agrega texto
  // antes/después pese a la instrucción de no hacerlo. Buscamos primero un
  // bloque con fences en cualquier posición y, si no hay, el primer objeto {...}.
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();

  const braceMatch = rawText.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0].trim();

  return rawText.trim();
}

function parseMinutes(rawText: string): number {
  const jsonText = extractJson(rawText);

  let parsed: { minutes: number };
  try {
    parsed = JSON.parse(jsonText) as { minutes: number };
  } catch {
    throw new Error(
      `No se pudo interpretar la respuesta de Gemini como JSON: "${rawText.slice(0, 200)}"`
    );
  }

  if (typeof parsed.minutes !== "number" || !Number.isFinite(parsed.minutes)) {
    throw new Error("Gemini no devolvió un número de minutos válido.");
  }

  return Math.round(parsed.minutes);
}

export async function analyzeScreenTimeImage(
  imageBase64: string,
  mimeType: string
): Promise<number> {
  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: imageBase64, mimeType } },
        SCREEN_TIME_PROMPT,
      ]);

      return parseMinutes(result.response.text().trim());
    } catch (error) {
      if (isModelUnavailableError(error)) {
        console.warn(
          `Gemini: el modelo "${modelName}" no está disponible ahora mismo. Probando el siguiente modelo de la lista.`,
          error instanceof Error ? error.message : error
        );
        continue;
      }
      console.error(`Gemini: el modelo "${modelName}" falló con un error no recuperable:`, error);
      throw error;
    }
  }

  throw new Error("Todos los modelos de IA están saturados en este momento.");
}
