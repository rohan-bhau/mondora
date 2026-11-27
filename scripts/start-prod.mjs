import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_ENV = [
  "APP_KEYS",
  "ADMIN_JWT_SECRET",
  "API_TOKEN_SALT",
  "TRANSFER_TOKEN_SALT",
  "ENCRYPTION_KEY",
  "STUDIO_TOKEN",
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(", ")}. Set them in your Railway/Render dashboard before starting.`,
  );
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const dataDir = process.env.DATA_DIR || "/data";
const strapiDataDir = resolve(dataDir, "strapi");
const ollamaModelsDir = resolve(dataDir, "ollama");
mkdirSync(strapiDataDir, { recursive: true });
mkdirSync(ollamaModelsDir, { recursive: true });

const webPort = String(Number(process.env.PORT) || 3000);
const strapiPort = String(Number(process.env.STRAPI_PORT) || 1337);
const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";

const children = [];
let stopping = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }
  process.exitCode = code;
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

function launch(label, command, args, cwd, extraEnv = {}, critical = true) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) {
    let pending = "";
    stream.on("data", (chunk) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) console.log(`[${label}] ${line}`);
    });
  }
  child.on("error", (err) => {
    console.error(`[${label}] ${err.message}`);
    if (critical) stopAll(1);
  });
  child.on("exit", (code) => {
    if (!stopping && critical) {
      console.error(`[${label}] exited with code ${code}`);
      stopAll(code || 1);
    }
  });
  return child;
}

async function waitForHttp(url, attempts = 240, delayMs = 250) {
  for (let i = 0; i < attempts && !stopping; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function ensureOllamaModel() {
  const ready = await waitForHttp(`${ollamaUrl}/api/tags`, 120, 500);
  if (!ready) {
    console.error("[Ollama] daemon did not become ready in time.");
    return;
  }
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    const body = await res.json();
    const exists = body.models?.some((m) => m.name === ollamaModel);
    if (exists) {
      console.log(`[Ollama] model ${ollamaModel} already cached on volume.`);
      return;
    }
  } catch {}
  console.log(`[Ollama] pulling ${ollamaModel} into ${ollamaModelsDir}...`);
  launch(
    "OllamaPull",
    "ollama",
    ["pull", ollamaModel],
    root,
    { OLLAMA_HOST: "127.0.0.1:11434", OLLAMA_MODELS: ollamaModelsDir },
    false,
  );
}

launch("Ollama", "ollama", ["serve"], root, {
  OLLAMA_HOST: "127.0.0.1:11434",
  OLLAMA_MODELS: ollamaModelsDir,
});
void ensureOllamaModel();

launch(
  "Strapi",
  process.execPath,
  ["node_modules/@strapi/strapi/bin/strapi.js", "start"],
  resolve(root, "strapi"),
  {
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: strapiPort,
    DATABASE_FILENAME: resolve(strapiDataDir, "data.db"),
    STRAPI_TELEMETRY_DISABLED: "true",
  },
);

const strapiReady = await waitForHttp(`http://127.0.0.1:${strapiPort}/_health`, 240, 250);
if (!strapiReady && !stopping) {
  console.error("[Strapi] failed healthcheck during startup.");
  stopAll(1);
} else if (!stopping) {
  launch(
    "Next.js",
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", webPort],
    root,
    {
      NODE_ENV: "production",
      NODE_OPTIONS: "--dns-result-order=ipv4first",
      STRAPI_URL: `http://127.0.0.1:${strapiPort}`,
      OLLAMA_URL: ollamaUrl,
      OLLAMA_MODEL: ollamaModel,
    },
  );
}
