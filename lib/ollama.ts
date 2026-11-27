import { setDefaultResultOrder } from "node:dns";
import type { ModelOutput } from "./types";

setDefaultResultOrder("ipv4first");

const GEMINI_TEXT_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
];

function normalizeJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(normalizeJsonSchema);
  const record = schema as Record<string, unknown>;
  if ("const" in record && !("enum" in record)) {
    const val = record.const;
    const rest = { ...record };
    delete rest.const;
    return {
      ...(normalizeJsonSchema(rest) as Record<string, unknown>),
      type: typeof val,
      enum: [val],
    };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = normalizeJsonSchema(v);
  }
  return out;
}

async function generateViaGemini(
  apiKey: string,
  system: string,
  prompt: string,
  conversation: { role: string; content: string }[],
  format: string | Record<string, unknown>,
): Promise<ModelOutput | null> {
  const contents = [
    ...conversation.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];

  const generationConfig: Record<string, unknown> = {
    temperature: 0.15,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
  };
  if (typeof format === "object" && format !== null) {
    generationConfig.responseJsonSchema = normalizeJsonSchema(format);
  }

  for (const model of GEMINI_TEXT_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig,
          }),
          signal: AbortSignal.timeout(45000),
        },
      );
      if (!response.ok) continue;

      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const parts = body.candidates?.[0]?.content?.parts || [];
      const rawJson = parts.find(
        (p) => typeof p.text === "string" && p.text.trim().startsWith("{"),
      )?.text;
      if (!rawJson) continue;
      return JSON.parse(rawJson) as ModelOutput;
    } catch {}
  }
  return null;
}

export async function generate(
  system: string,
  prompt: string,
  conversation: { role: string; content: string }[] = [],
  format: string | Record<string, unknown> = "json",
): Promise<ModelOutput> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const viaGemini = await generateViaGemini(
      geminiKey,
      system,
      prompt,
      conversation,
      format,
    );
    if (viaGemini) return viaGemini;
  }

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
          options: { temperature: 0.15, num_ctx: 6144, num_predict: 1400 },
        }),
        signal: AbortSignal.timeout(240000),
      },
    );
  } catch {
    throw new Error(
      "AI model is unavailable or took too long. Please retry in a moment.",
    );
  }
  if (!response.ok)
    throw new Error(
      "Ollama could not load the model. Run ollama pull qwen2.5:3b (or check OLLAMA_MODEL).",
    );
  try {
    return JSON.parse((await response.json()).message.content);
  } catch {
    throw new Error("The AI model returned invalid JSON. Please retry.");
  }
}
