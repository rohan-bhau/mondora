import type { ModelOutput } from "./types.ts";
export async function generate(
  system: string,
  prompt: string,
  conversation: { role: string; content: string }[] = [],
  format: string | Record<string, unknown> = "json",
): Promise<ModelOutput> {
  let response;
  try {
    response = await fetch(
      `${process.env.OLLAMA_URL || "http://127.0.0.1:11434"}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "qwen2.5:3b",
          stream: false,
          format,
          messages: [
            { role: "system", content: system },
            ...conversation,
            { role: "user", content: prompt },
          ],
          options: { temperature: 0.15, num_ctx: 16384, num_predict: 1800 },
        }),
        signal: AbortSignal.timeout(240000),
      },
    );
  } catch {
    throw new Error(
      "Ollama is unavailable or took too long. Start Ollama and pull qwen2.5:3b, then retry. Your imported captions are saved.",
    );
  }
  if (!response.ok)
    throw new Error(
      "Ollama could not load the model. Run ollama pull qwen2.5:3b (or check OLLAMA_MODEL).",
    );
  try {
    return JSON.parse((await response.json()).message.content);
  } catch {
    throw new Error("Ollama returned invalid JSON. Please retry.");
  }
}
