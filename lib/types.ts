export type Evidence = { id: string; start: number; end: number; text: string };
export type Claim = {
  kind: "video" | "additional" | "uncertain";
  text: string;
  evidence: Evidence[];
};
export type Answer = { claims: Claim[] };
export type Message = { id: string; question: string; answer: Answer };
export type Chapter = {
  id: string;
  title: string;
  start: number;
  end: number;
  source: "creator" | "description" | "ai" | "gap";
  summary?: Answer;
  messages: Message[];
};
export type Video = {
  id: string;
  title: string;
  author: string;
  duration: number;
  language: string;
  automatic: boolean;
  chapters: Chapter[];
  overview: string | null;
  selectedChapter: number;
  position: number;
  segmentCount: number;
  outlineProgress: number;
  outlineTotal: number;
};
export type Session = Pick<Video, "id" | "title" | "author" | "duration"> & {
  chapterCount: number;
  updatedAt: string;
};

/** Persisted data. These fields stay compatible with existing SQLite sessions. */
export type StoredChapter = Chapter & {
  summaryVersion?: number;
  summaryParts?: Answer[];
};
export type OutlineNote = {
  title: string;
  start: number;
  source: Chapter["source"];
};
export type StoredVideo = Omit<
  Video,
  "segmentCount" | "outlineTotal" | "chapters"
> & {
  chapters: StoredChapter[];
  segments: Evidence[];
  description: string;
  outlineNotes: OutlineNote[];
  importedAt: string;
};
export type LearningNote = {
  documentId: string;
  youtubeId: string;
  chapterId: string;
  title: string;
  body: string;
};
export type ModelClaim = {
  kind?: string;
  text?: string;
  segmentIds?: string[];
};
export type ModelOutput = {
  claims?: ModelClaim[];
  chapters?: { title: string; segmentId: string }[];
  answer?: string;
};
export type Save = () => Promise<unknown>;
export type YouTubeMetadata = {
  title?: string;
  channel?: string;
  uploader?: string;
  description?: string;
  duration?: number;
  chapters?: { title: string; start_time: number }[];
  subtitles?: Record<string, { ext: string; url: string }[]>;
  automatic_captions?: Record<string, { ext: string; url: string }[]>;
};
