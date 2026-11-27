import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseCaptions, creatorChapters } from "./core.ts";
import type { StoredVideo, YouTubeMetadata } from "./types.ts";
const run = promisify(execFile);
const YOUTUBE_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
const RATE_LIMIT_MESSAGE =
  "YouTube is temporarily rate-limiting caption downloads from your network (HTTP 429). Wait before retrying, complete any YouTube CAPTCHA in your browser, or use a different network/IP.";
const ytDlpBin = () =>
  process.env.YTDLP_BIN?.trim() || resolve(process.cwd(), ".venv/bin/yt-dlp");
async function downloadCaptionsWithYtDlp(id: string, language: string) {
  const directory = await mkdtemp(join(tmpdir(), "oneminute-captions-"));
  try {
    await run(
      ytDlpBin(),
      [
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--js-runtimes",
        "node",
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
export async function importYouTube(id: string): Promise<StoredVideo> {
  let stdout;
  try {
    ({ stdout } = await run(
      ytDlpBin(),
      [
        "--dump-single-json",
        "--js-runtimes",
        "node",
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
    if (e.code === "ENOENT")
      throw new Error(
        "yt-dlp is missing. Follow the local setup instructions and restart the app.",
      );
    const detail =
      typeof e.stderr === "string"
        ? e.stderr.trim().split("\n").slice(-3).join(" | ")
        : e.message;
    console.warn(`[studio] yt-dlp failed for ${id}: ${detail}`);
    throw new Error(
      "YouTube could not be reached or refused access. Check that the video is public and playable, and update yt-dlp. No transcript was imported.",
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
      "Captions are unavailable for this video. OneMinute Learn needs manual or automatic captions to build a grounded study session.",
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
