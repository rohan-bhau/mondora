import { execFile } from "node:child_process";
import { setDefaultResultOrder } from "node:dns";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseCaptions, parsePastedTranscript, creatorChapters } from "./core";
import type { Chapter, Evidence, StoredVideo, YouTubeMetadata } from "./types";

setDefaultResultOrder("ipv4first");
const run = promisify(execFile);
const YOUTUBE_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
const RATE_LIMIT_MESSAGE =
  "YouTube is temporarily rate-limiting caption downloads from your network (HTTP 429). Paste the transcript manually below or retry later.";
const ytDlpBin = () =>
  process.env.YTDLP_BIN?.trim() || resolve(process.cwd(), ".venv/bin/yt-dlp");

function cookieArgs(): string[] {
  const candidates = [
    process.env.YTDLP_COOKIES_FILE?.trim(),
    process.env.DATA_DIR ? resolve(process.env.DATA_DIR, "cookies.txt") : "/data/cookies.txt",
    resolve(process.cwd(), "cookies.txt"),
  ].filter((p): p is string => Boolean(p));

  for (const filePath of candidates) {
    try {
      if (existsSync(filePath) && statSync(filePath).size > 0) {
        return ["--cookies", filePath];
      }
    } catch {}
  }
  return [];
}

async function downloadCaptionsWithYtDlp(id: string, language: string) {
  const directory = await mkdtemp(join(tmpdir(), "mindora-captions-"));
  try {
    await run(
      ytDlpBin(),
      [
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--js-runtimes",
        "node",
        ...cookieArgs(),
        "--write-subs",
        "--write-auto-subs",
        "--sub-format",
        "json3",
        "--sub-langs",
        language,
        "--output",
        join(directory, "%(id)s.%(ext)s"),
        `https://www.youtube.com/watch?v=${id}`,
      ],
      { timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
    );
    const filename = (await readdir(directory)).find((name) =>
      name.endsWith(".json3"),
    );
    if (!filename)
      throw new Error("yt-dlp did not create a JSON3 caption file");
    return JSON.parse(await readFile(join(directory, filename), "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function fetchOembedMeta(id: string): Promise<{ title: string; author: string }> {
  let title = `YouTube Lesson (${id})`;
  let author = "YouTube";
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: YOUTUBE_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const info = (await response.json()) as {
        title?: string;
        author_name?: string;
      };
      if (info.title?.trim()) title = info.title.trim();
      if (info.author_name?.trim()) author = info.author_name.trim();
    }
  } catch {}
  return { title, author };
}

function buildStoredVideo(
  id: string,
  title: string,
  author: string,
  segments: Evidence[],
  language = "en",
  automatic = true,
  chapters: Chapter[] = [],
): StoredVideo {
  const duration = Math.ceil(
    segments.reduce((maxEnd, seg) => Math.max(maxEnd, seg.end), 0),
  );
  return {
    id,
    title,
    author,
    description: "",
    duration,
    language,
    automatic,
    segments,
    chapters,
    outlineProgress: chapters.length ? 1 : 0,
    outlineNotes: [],
    overview: null,
    selectedChapter: 0,
    position: 0,
    importedAt: new Date().toISOString(),
  };
}

async function importViaSupadata(id: string): Promise<StoredVideo | null> {
  const apiKey = process.env.SUPADATA_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const endpoint = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const response = await fetch(endpoint, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      lang?: string;
      content?: { text?: string; offset?: number; duration?: number }[];
    };
    if (!Array.isArray(payload.content) || !payload.content.length) return null;

    const segments = parseCaptions({
      events: payload.content.map((item) => ({
        tStartMs: Number(item.offset) || 0,
        dDurationMs: Number(item.duration) || 2000,
        segs: [{ utf8: item.text || "" }],
      })),
    });
    if (!segments.length) return null;

    const { title, author } = await fetchOembedMeta(id);
    return buildStoredVideo(id, title, author, segments, payload.lang || "en", true);
  } catch {
    return null;
  }
}

function toSeconds(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".");
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map(Number);
      if (parts.every((n) => Number.isFinite(n) && n >= 0)) {
        return parts.reduce((acc, n) => acc * 60 + n, 0);
      }
    }
    return Number(trimmed);
  }
  return NaN;
}

const GEMINI_TRANSCRIPT_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
];

async function importViaGemini(id: string): Promise<StoredVideo | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  let lastReason = "";
  for (const model of GEMINI_TRANSCRIPT_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  fileData: {
                    fileUri: `https://www.youtube.com/watch?v=${id}`,
                    mimeType: "video/mp4",
                  },
                },
                {
                  text: 'Extract a chronological transcript and structured lesson chapters from this video. Keep segment text in the video\'s spoken language and use accurate MM:SS (or HH:MM:SS) timestamps. Divide the video into 5 to 9 clear, logical topic chapters starting at "00:00" with concise descriptive titles. Cover the entire video from start to finish in 8-18 second segments (at most 140 segments total). Return valid JSON {"language":"en","chapters":[{"title":"Concise chapter title","start":"00:00"}],"segments":[{"start":"00:00","end":"00:14","text":"spoken passage"}]}.',
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 65536,
            mediaResolution: "MEDIA_RESOLUTION_LOW",
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        lastReason = `${model} HTTP ${response.status}`;
        console.warn(`[studio] Transcript fallback failed (${lastReason})`);
        if (response.status === 400 && /private|unavailable|permission/i.test(errBody)) {
          break;
        }
        continue;
      }

      const result = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const parts = result.candidates?.[0]?.content?.parts || [];
      const rawJson = parts.find((p) => typeof p.text === "string" && p.text.trim().startsWith("{"))?.text;
      if (!rawJson) {
        lastReason = `${model} returned empty JSON`;
        continue;
      }

      const parsed = JSON.parse(rawJson) as {
        language?: string;
        chapters?: { title?: string; start?: string | number }[];
        segments?: { start?: string | number; end?: string | number; text?: string }[];
      };
      if (!Array.isArray(parsed.segments) || !parsed.segments.length) {
        lastReason = `${model} returned 0 segments`;
        continue;
      }

      const segments: Evidence[] = [];
      for (const item of parsed.segments) {
        const text = typeof item.text === "string" ? item.text.trim() : "";
        const start = toSeconds(item.start);
        if (!text || !Number.isFinite(start) || start < 0) continue;
        const parsedEnd = toSeconds(item.end);
        const end =
          Number.isFinite(parsedEnd) && parsedEnd > start
            ? parsedEnd
            : start + 15;
        segments.push({
          id: `s${segments.length}`,
          start,
          end,
          text: text.slice(0, 1600),
        });
      }
      if (!segments.length) continue;

      segments.sort((a, b) => a.start - b.start);
      const duration = Math.ceil(
        segments.reduce((maxEnd, seg) => Math.max(maxEnd, seg.end), 0),
      );

      const rawChapters = (Array.isArray(parsed.chapters) ? parsed.chapters : [])
        .map((ch) => {
          const rawStart = toSeconds(ch.start);
          const snapped = segments.find((s) => s.end > rawStart)?.start ?? rawStart;
          return {
            title: typeof ch.title === "string" ? ch.title.trim().slice(0, 150) : "",
            start: snapped,
          };
        })
        .filter((ch) => ch.title && Number.isFinite(ch.start) && ch.start >= 0 && ch.start < duration)
        .sort((a, b) => a.start - b.start)
        .filter((ch, idx, arr) => idx === 0 || ch.start > arr[idx - 1].start);

      let chapters: Chapter[] = [];
      if (rawChapters.length >= 2) {
        rawChapters[0].start = 0;
        const candidateChapters = rawChapters.map((ch, idx) => ({
          id: `chapter-${idx}`,
          title: ch.title,
          start: ch.start,
          end: rawChapters[idx + 1]?.start ?? duration,
          source: "ai" as const,
          messages: [],
        }));
        const nonEmpty = candidateChapters.filter((ch) =>
          segments.some((s) => s.start < ch.end && s.end > ch.start),
        );
        if (nonEmpty.length >= 2) {
          nonEmpty[0].start = 0;
          chapters = nonEmpty.map((ch, idx) => ({
            ...ch,
            id: `chapter-${idx}`,
            end: nonEmpty[idx + 1]?.start ?? duration,
          }));
        }
      }

      const { title, author } = await fetchOembedMeta(id);
      return buildStoredVideo(
        id,
        title,
        author,
        segments,
        typeof parsed.language === "string" && parsed.language ? parsed.language : "en",
        true,
        chapters,
      );
    } catch (err) {
      lastReason = `${model}: ${(err as Error).message}`;
      console.warn(`[studio] Gemini transcript error (${lastReason})`);
    }
  }

  if (lastReason) {
    console.warn(`[studio] All Gemini transcript models failed for ${id}: ${lastReason}`);
  }
  return null;
}

export async function importFromTranscript(
  id: string,
  rawTranscript: string,
): Promise<StoredVideo> {
  const segments = parsePastedTranscript(rawTranscript);
  if (!segments.length) {
    throw new Error(
      "Could not find any transcript text. Copy the transcript from YouTube and paste it again.",
    );
  }

  const { title, author } = await fetchOembedMeta(id);
  return buildStoredVideo(id, title, author, segments, "en", false);
}

export async function importYouTube(id: string): Promise<StoredVideo> {
  let stdout;
  try {
    ({ stdout } = await run(
      ytDlpBin(),
      [
        "--dump-single-json",
        "--js-runtimes",
        "node",
        ...cookieArgs(),
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "25",
        `https://www.youtube.com/watch?v=${id}`,
      ],
      { timeout: 120000, maxBuffer: 32 * 1024 * 1024 },
    ));
  } catch (error) {
    const e = error as Error & { code?: string; stderr?: string };
    const detail =
      typeof e.stderr === "string"
        ? e.stderr.trim().split("\n").slice(-3).join(" | ")
        : e.message;
    console.warn(`[studio] yt-dlp failed for ${id}: ${detail}`);

    const viaSupadata = await importViaSupadata(id);
    if (viaSupadata) return viaSupadata;

    const viaGemini = await importViaGemini(id);
    if (viaGemini) return viaGemini;

    if (e.code === "ENOENT")
      throw new Error(
        "yt-dlp is missing. Follow the local setup instructions and restart the app.",
      );
    throw new Error(
      "Automatic caption download was blocked by YouTube on this server IP. Paste the video transcript below to start your study session.",
    );
  }
  const meta: YouTubeMetadata = JSON.parse(stdout);
  const candidates: { url: string; language: string; automatic: boolean }[] =
    [];
  for (const [automatic, tracks] of [
    [false, meta.subtitles],
    [true, meta.automatic_captions],
  ] as const) {
    for (const [language, formats] of Object.entries(tracks || {})) {
      if (
        language.includes("-") &&
        language !== "en-orig" &&
        automatic &&
        !language.endsWith("-orig")
      )
        continue; // avoid machine translated tracks
      const format = formats.find((f) => f.ext === "json3");
      if (format) candidates.push({ ...format, language, automatic });
    }
  }
  candidates.sort(
    (a, b) =>
      Number(!a.language.startsWith("en")) * 2 +
      Number(a.automatic) -
      (Number(!b.language.startsWith("en")) * 2 + Number(b.automatic)),
  );
  const track = candidates[0];
  if (!track)
    throw new Error(
      "Captions are unavailable for this video. Mindora needs manual or automatic captions to build a grounded study session.",
    );
  let segments;
  try {
    const response = await fetch(track.url, {
      headers: YOUTUBE_HEADERS,
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 429)
      throw Object.assign(new Error(RATE_LIMIT_MESSAGE), {
        code: "YOUTUBE_RATE_LIMIT",
      });
    if (!response.ok) throw new Error("caption download failed");
    segments = parseCaptions(await response.json());
    if (!segments.length) throw new Error("caption response was empty");
  } catch (error) {
    const directError = error as Error & { code?: string };
    if (directError.code === "YOUTUBE_RATE_LIMIT") throw directError;
    console.warn(
      `[studio] Direct caption download failed for ${id}; retrying through yt-dlp: ${directError.message}`,
    );
    try {
      segments = parseCaptions(
        await downloadCaptionsWithYtDlp(id, track.language),
      );
    } catch (error) {
      const fallbackError = error as Error;
      console.warn(
        `[studio] yt-dlp caption fallback failed for ${id}: ${fallbackError.message}`,
      );
      if (/HTTP Error 429|Too Many Requests/i.test(fallbackError.message))
        throw new Error(RATE_LIMIT_MESSAGE);
      throw new Error(
        "YouTube listed captions but refused both download methods. Update yt-dlp, then retry.",
      );
    }
  }
  if (!segments.length)
    throw new Error(
      "The caption track is empty. No study session was created.",
    );
  const duration = segments.reduce(
    (n, s) => Math.max(n, s.end),
    Number(meta.duration) || 0,
  );
  return {
    id,
    title: meta.title || "Untitled video",
    author: meta.channel || meta.uploader || "YouTube",
    description: meta.description || "",
    duration,
    language: track.language,
    automatic: track.automatic,
    segments,
    chapters: creatorChapters(meta, duration),
    outlineProgress: 0,
    outlineNotes: [],
    overview: null,
    selectedChapter: 0,
    position: 0,
    importedAt: new Date().toISOString(),
  };
}
