import { randomUUID } from "node:crypto";
import { videoId, chunks, chapterSegments, retrieve } from "./core.ts";
import { importYouTube } from "./youtube.ts";
import { summary, SUMMARY_VERSION } from "./summaries.ts";
import { outline } from "./chapters.ts";
import { explain } from "./tutor.ts";
import * as storage from "./strapi.ts";
import type { StoredVideo, Video } from "./types.ts";
// The local app runs in one Node process. Retain locks through Next development reloads.
const globalLocks = globalThis as typeof globalThis & {
  studioLocks?: Map<string, Promise<unknown>>;
};
const locks = (globalLocks.studioLocks ||= new Map());
async function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}
export function publicVideo(video: StoredVideo): Video {
  const { segments, description, outlineNotes, importedAt, ...rest } = video;
  void description;
  void outlineNotes;
  void importedAt;
  return {
    ...rest,
    segmentCount: segments.length,
    outlineTotal: chunks(segments).length,
    chapters: video.chapters.map((c) => {
      const { summaryParts, summaryVersion, ...chapter } = c;
      void summaryParts;
      if (summaryVersion !== SUMMARY_VERSION) delete chapter.summary;
      return chapter;
    }),
  };
}
export async function dispatch(
  method: string,
  path: string[],
  body: Record<string, unknown> = {},
) {
  if (method === "GET" && path.length === 1 && path[0] === "health") {
    let ollama = false,
      model = false;
    const modelName = process.env.OLLAMA_MODEL || "qwen2.5:3b";
    try {
      const r = await fetch(
        `${process.env.OLLAMA_URL || "http://127.0.0.1:11434"}/api/tags`,
        { signal: AbortSignal.timeout(2000) },
      );
      const d = await r.json();
      ollama = r.ok;
      model = d.models?.some((m: { name: string }) => m.name === modelName);
    } catch {}
    return { strapi: await storage.storageHealth(), ollama, model, modelName };
  }
  if (method === "GET" && path.length === 1 && path[0] === "sessions") {
    return (await storage.listVideos()).map((r) => ({
      id: r.youtubeId,
      title: r.payload.title,
      author: r.payload.author,
      duration: r.payload.duration,
      chapterCount: r.payload.chapters.length,
      updatedAt: r.updatedAt,
    }));
  }
  if (method === "POST" && path.length === 1 && path[0] === "import") {
    const id = videoId(typeof body.url === "string" ? body.url : "");
    return serial(id, async () => {
      let row = await storage.findVideo(id);
      const reused = Boolean(row);
      if (!row) row = await storage.createVideo(await importYouTube(id));
      return { video: publicVideo(row.payload), reused };
    });
  }
  if (path[0] !== "videos" || !/^[\w-]{11}$/.test(path[1] || ""))
    throw new Error("Unknown study route.");
  const id = path[1];
  if (path.length === 3 && path[2] === "notes") {
    if (method === "GET") return storage.learningNotes(id);
    if (method === "POST") {
      const chapterId = typeof body.chapterId === "string" ? body.chapterId : "";
      const note = typeof body.body === "string" ? body.body.trim() : "";
      const row = await storage.findVideo(id);
      if (!row) throw new Error("Import this video first.");
      if (!row.payload.chapters.some((chapter) => chapter.id === chapterId))
        throw new Error("Select a chapter first.");
      if (!note || note.length > 10000)
        throw new Error("Write a note between 1 and 10,000 characters.");
      return storage.saveLearningNote(id, chapterId, note);
    }
  }
  if (method === "GET" && path.length === 2) {
    const row = await storage.findVideo(id);
    if (!row) throw new Error("This saved session was not found.");
    return publicVideo(row.payload);
  }
  if (method !== "POST" || path.length !== 3)
    throw new Error("Unknown study route.");
  return serial(id, async () => {
    const row = await storage.findVideo(id);
    if (!row) throw new Error("Import this video first.");
    const video = row.payload;
    const save = () => storage.saveVideo(row.documentId, video);
    switch (path[2]) {
      case "outline":
        if (!video.chapters.length) await outline(video, save);
        return publicVideo(video);
      case "overview":
        if (!video.overview) {
          video.overview = `This session covers ${video.chapters.length} chapters: ${video.chapters
            .slice(0, 5)
            .map((c) => c.title)
            .join("; ")}.`;
          await save();
        }
        return { overview: video.overview };
      case "progress": {
        const index = Number(body.chapter);
        if (Number.isInteger(index) && video.chapters[index])
          video.selectedChapter = index;
        if (typeof body.position === "number" && Number.isFinite(body.position))
          video.position = Math.max(0, Math.min(video.duration, body.position));
        await save();
        return { ok: true };
      }
      case "summary": {
        const chapter = video.chapters.find((c) => c.id === body.chapterId);
        if (!chapter) throw new Error("Select a chapter first.");
        return (
          (chapter.summaryVersion === SUMMARY_VERSION && chapter.summary) ||
          summary(video, chapter, save)
        );
      }
      case "chat": {
        const chapter = video.chapters.find((c) => c.id === body.chapterId);
        if (!chapter) throw new Error("Select a chapter first.");
        const question =
          typeof body.question === "string" ? body.question.trim() : "";
        if (!question || question.length > 2000)
          throw new Error("Ask a question between 1 and 2,000 characters.");
        const requestId =
          typeof body.requestId === "string"
            ? body.requestId.slice(0, 100)
            : randomUUID();
        const existing = chapter.messages.find((m) => m.id === requestId);
        if (existing) return existing;
        const local = retrieve(
          chapterSegments(video, chapter),
          `${chapter.title} ${question}`,
          chapter.messages,
          6500,
        );
        const broader = retrieve(
          video.segments,
          question,
          chapter.messages,
          3000,
        );
        const evidence = [
          ...new Map([...local, ...broader].map((s) => [s.id, s])).values(),
        ];
        const answer = await explain(evidence, question, chapter.messages, {
          topic: chapter.title,
          videoTitle: video.title,
        });
        const message = { id: requestId, question, answer };
        chapter.messages.push(message);
        await save();
        return message;
      }
      default:
        throw new Error("Unknown study action.");
    }
  });
}
