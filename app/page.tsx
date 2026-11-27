"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Answer, Chapter, Session, Video } from "@/lib/types";
import Link from "next/link";
import { StudyNotes } from "./components/study-notes";

type Player = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};
declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => Player;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
function MindoraLogo(): React.ReactElement {
  return (
    <svg
      viewBox="56 60 400 370"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#6200E9"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 403 187 L 396 186 L 390 188 L 380 194 L 373 201 L 368 208 L 361 226 L 354 233 L 351 234 L 341 234 L 337 232 L 332 227 L 319 198 L 315 192 L 305 183 L 296 183 L 285 188 L 274 196 L 268 202 L 262 213 L 262 223 L 261 224 L 261 389 L 288 369 L 317 354 L 351 343 L 355 343 L 371 339 L 376 339 L 377 338 L 396 336 L 399 335 L 403 331 L 405 327 L 405 191 Z M 74 188 L 73 192 L 73 355 L 77 365 L 82 369 L 85 370 L 99 370 L 100 371 L 130 372 L 131 373 L 138 373 L 139 374 L 145 374 L 146 375 L 167 378 L 187 383 L 207 390 L 230 401 L 245 411 L 251 413 L 259 413 L 266 411 L 289 396 L 291 396 L 305 389 L 323 383 L 343 378 L 363 375 L 364 374 L 370 374 L 371 373 L 389 372 L 390 371 L 425 370 L 431 367 L 435 362 L 437 356 L 437 191 L 434 185 L 430 183 L 422 183 L 417 188 L 417 328 L 414 336 L 408 342 L 399 346 L 380 348 L 374 350 L 359 352 L 343 356 L 333 360 L 330 360 L 327 362 L 317 365 L 305 371 L 288 382 L 266 401 L 257 404 L 249 403 L 243 400 L 229 387 L 216 377 L 194 365 L 172 357 L 169 357 L 157 353 L 153 353 L 137 349 L 132 349 L 131 348 L 126 348 L 125 347 L 118 347 L 117 346 L 108 345 L 98 338 L 95 333 L 94 325 L 93 324 L 93 188 L 88 183 L 80 183 L 76 185 Z M 109 157 L 106 160 L 105 163 L 105 305 L 106 306 L 106 328 L 110 334 L 114 336 L 151 341 L 171 346 L 192 353 L 213 363 L 226 371 L 249 389 L 248 388 L 249 387 L 249 214 L 246 207 L 237 197 L 228 190 L 218 184 L 194 173 L 173 166 L 149 160 L 145 160 L 140 158 L 134 158 L 126 156 L 112 156 Z M 406 105 L 403 103 L 398 104 L 387 115 L 386 117 L 387 122 L 392 123 L 405 111 Z M 297 101 L 292 105 L 291 113 L 293 116 L 297 118 L 301 118 L 304 117 L 307 114 L 308 107 L 304 102 Z M 345 87 L 342 91 L 341 99 L 336 115 L 327 130 L 320 137 L 313 142 L 303 147 L 289 151 L 285 151 L 281 153 L 280 158 L 283 160 L 306 167 L 320 176 L 331 189 L 336 199 L 342 218 L 345 221 L 349 221 L 351 219 L 356 203 L 362 191 L 368 183 L 383 171 L 395 165 L 413 160 L 415 158 L 415 155 L 412 152 L 398 149 L 385 144 L 374 136 L 361 121 L 356 111 L 350 88 Z M 385 77 L 380 80 L 373 93 L 372 99 L 375 102 L 378 102 L 381 100 L 389 84 L 389 80 Z"
      />
    </svg>
  );
}

function Icon({
  name,
  size = 20,
  ...props
}: { name: string; size?: number } & React.SVGProps<SVGSVGElement>) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    play: <path d="m9 5 11 7-11 7z" />,
    link: (
      <>
        <path
          d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
          transform="translate(1 0)"
        />
      </>
    ),
    book: (
      <>
        <path d="M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3zM12 6v15" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4m-2-2h4" />
      </>
    ),
    chat: (
      <path d="M21 11a8.5 8.5 0 0 1-9 8 10 10 0 0 1-4-.8L3 20l1.5-5A7.7 7.7 0 0 1 3 11a9 9 0 0 1 18 0Z" />
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C6 2 2 9 6 16s16 4 14-13ZM6 19 16 9" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7-11 11M10 3H4v17h17v-6" />
      </>
    ),
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    send: <path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" />
      </>
    ),
    stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
    github: (
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2 0 15 2a13.4 13.4 0 0 0-7 0C4.8 0 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.5 6.8 7A4.8 4.8 0 0 0 8 18v4m0-3c-3 .9-3-1.5-4-2" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.book}
    </svg>
  );
}
type SpeechRange = { start: number; end: number } | null;

function spokenWordRange(
  text: string,
  character: number,
  length = 0,
): SpeechRange {
  if (!text || character < 0 || character >= text.length) return null;
  let start = character;
  while (start < text.length && /\s/.test(text[start])) start += 1;
  let end = length > 0 ? Math.min(text.length, character + length) : start;
  if (length > 0) {
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
  } else {
    while (end < text.length && !/\s/.test(text[end])) end += 1;
  }
  return end > start ? { start, end } : null;
}

function HighlightedText({
  text,
  range,
}: {
  text: string;
  range: SpeechRange;
}) {
  if (!range || range.end <= 0 || range.start >= text.length) return text;
  const start = Math.max(0, range.start);
  const end = Math.min(text.length, range.end);
  return (
    <>
      {text.slice(0, start)}
      <mark className="spoken-word">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function SpeechButton({
  text,
  label,
  onRangeChange,
}: {
  text: string;
  label: string;
  onRangeChange?: (range: SpeechRange) => void;
}) {
  const id = useId();
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    );
    const stop = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail !== id) {
        setSpeaking(false);
        onRangeChange?.(null);
      }
    };
    window.addEventListener("mindora-speech", stop);
    return () => window.removeEventListener("mindora-speech", stop);
  }, [id, onRangeChange]);

  function toggleSpeech() {
    if (!supported || !text.trim()) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      onRangeChange?.(null);
      return;
    }

    window.speechSynthesis.cancel();
    window.dispatchEvent(new CustomEvent("mindora-speech", { detail: id }));
    const utterance = new SpeechSynthesisUtterance(text.trim());
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find(
        (voice) =>
          /^en/i.test(voice.lang) &&
          /samantha|ava|google.*english|microsoft.*(aria|jenny|guy)/i.test(
            voice.name,
          ),
      ) ??
      voices.find((voice) => /^en/i.test(voice.lang)) ??
      null;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onboundary = (event) =>
      onRangeChange?.(
        spokenWordRange(utterance.text, event.charIndex, event.charLength),
      );
    utterance.onend = () => {
      setSpeaking(false);
      onRangeChange?.(null);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      onRangeChange?.(null);
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      type="button"
      className={`speech-button ${speaking ? "speaking" : ""}`}
      onClick={toggleSpeech}
      disabled={!supported || !text.trim()}
      aria-label={speaking ? `Stop reading ${label}` : `Listen to ${label}`}
      title={
        supported
          ? speaking
            ? "Stop reading"
            : "Listen"
          : "Voice playback is unavailable in this browser"
      }
    >
      <Icon name={speaking ? "stop" : "volume"} size={16} />
      <span>{speaking ? "Stop" : "Listen"}</span>
    </button>
  );
}
function ReadableParagraph({ text, label }: { text: string; label: string }) {
  const [range, setRange] = useState<SpeechRange>(null);
  return (
    <>
      <p>
        <HighlightedText text={text} range={range} />
      </p>
      <SpeechButton text={text} label={label} onRangeChange={setRange} />
    </>
  );
}
function time(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/studio/${path}`, {
    ...(body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message || "Something went wrong. Please retry.",
    );
  return data;
}
function Claims({
  answer,
  seek,
  compact = false,
}: {
  answer: Answer;
  seek: (n: number) => void;
  compact?: boolean;
}) {
  const [spokenRange, setSpokenRange] = useState<SpeechRange>(null);
  const speechText = answer.claims.map((claim) => claim.text).join(" ");
  let claimOffset = 0;
  return (
    <div className={`claims ${compact ? "compact" : ""}`}>
      {answer.claims.map((claim, i) => {
        const offset = claimOffset;
        claimOffset +=
          claim.text.length + (i < answer.claims.length - 1 ? 1 : 0);
        const localRange = spokenRange && {
          start: spokenRange.start - offset,
          end: spokenRange.end - offset,
        };
        return (
          <div className={`claim ${claim.kind}`} key={i}>
            {claim.kind !== "video" &&
              !(compact && claim.kind === "additional") && (
                <span className="claim-label">
                  <Icon name="chat" size={13} />
                  {claim.kind === "additional"
                    ? "Additional explanation"
                    : "A note on the evidence"}
                </span>
              )}
            <p>
              <HighlightedText text={claim.text} range={localRange} />
            </p>
            {claim.evidence.length > 0 && (
              <div className="evidence-list">
                {claim.evidence.map((e) => (
                  <details key={e.id} className="evidence">
                    <summary>
                      <span>
                        <Icon name="link" size={12} />
                        Transcript evidence
                      </span>
                      <span>
                        <button
                          className="citation-jump"
                          aria-label={`Replay at ${time(e.start)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            seek(e.start);
                          }}
                        >
                          {time(e.start)}
                        </button>
                        <Icon name="down" size={12} />
                      </span>
                    </summary>
                    <div>
                      <p>“{e.text}”</p>
                      <button
                        onClick={() => seek(e.start)}
                        className="timestamp"
                      >
                        <Icon name="play" size={11} />
                        Replay at {time(e.start)}
                      </button>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <SpeechButton
        text={speechText}
        label="tutor answer"
        onRangeChange={setSpokenRange}
      />
    </div>
  );
}
function VideoPlayer({
  id,
  start,
  onPosition,
  onSeekReady,
}: {
  id: string;
  start: number;
  onPosition: (n: number) => void;
  onSeekReady: (seek: ((n: number) => void) | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<Player | null>(null),
    pending = useRef(start);
  const report = useRef(onPosition),
    register = useRef(onSeekReady);
  report.current = onPosition;
  register.current = onSeekReady;
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    let disposed = false;
    const seek = (n: number) => {
      pending.current = n;
      if (instance.current) instance.current.seekTo(n, true);
    };
    register.current(seek);
    function mount() {
      if (disposed || !host.current || !window.YT?.Player || instance.current)
        return;
      const element = document.createElement("div");
      host.current.replaceChildren(element);
      instance.current = new window.YT.Player(element, {
        videoId: id,
        playerVars: {
          playsinline: 1,
          rel: 0,
          start: Math.floor(pending.current),
          origin: location.origin,
        },
        events: {
          onReady: () => {
            instance.current?.seekTo(pending.current, true);
            setFailure(false);
          },
          onError: () => setFailure(true),
        },
      });
    }
    if (window.YT?.Player) mount();
    else {
      window.onYouTubeIframeAPIReady = mount;
      if (!document.querySelector("script[data-youtube-api]")) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.dataset.youtubeApi = "true";
        script.onerror = () => setFailure(true);
        document.head.appendChild(script);
      }
    }
    const timer = setInterval(() => {
      const n = instance.current?.getCurrentTime?.();
      if (typeof n === "number") report.current(n);
    }, 1000);
    const readyTimeout = setTimeout(() => {
      if (!instance.current) setFailure(true);
    }, 15000);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(readyTimeout);
      register.current(null);
      instance.current?.destroy();
      instance.current = null;
    };
  }, [id]);
  return (
    <div className="player">
      <div ref={host} className="player-host" />
      {failure && (
        <div className="player-error">
          <Icon name="monitor" />
          <p>YouTube’s embedded player is unavailable.</p>
          <a
            href={`https://www.youtube.com/watch?v=${id}&t=${Math.floor(pending.current)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open this moment on YouTube <Icon name="external" size={14} />
          </a>
        </div>
      )}
    </div>
  );
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Home() {
  const [video, setVideo] = useState<Video | null>(null),
    [sessions, setSessions] = useState<Session[]>([]),
    [url, setUrl] = useState(""),
    [manualTranscript, setManualTranscript] = useState(""),
    [showTranscript, setShowTranscript] = useState(false);
  const [selected, setSelected] = useState(0),
    [importing, setImporting] = useState(false),
    [preparing, setPreparing] = useState(false),
    [summaryBusy, setSummaryBusy] = useState<string | null>(null),
    [chatBusy, setChatBusy] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<{
    videoId: string;
    chapterId: string;
    question: string;
    requestId: string;
    error?: string;
  } | null>(null);
  const [error, setError] = useState(""),
    [outlineOpen, setOutlineOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [tab, setTab] = useState<"explanation" | "transcript">("explanation");
  const seekRef = useRef<((n: number) => void) | null>(null),
    position = useRef(0),
    active = useRef<Video | null>(video),
    selectedRef = useRef(selected),
    chatEnd = useRef<HTMLDivElement>(null),
    transcriptRef = useRef<HTMLTextAreaElement>(null);
  active.current = video;
  selectedRef.current = selected;
  const chapter = video?.chapters[selected];
  const refresh = useCallback(() => {
    api<Session[]>("sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (chapter?.messages.length || chatBusy) {
      chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      chatEnd.current?.parentElement?.scrollTo({ top: 0 });
    }
  }, [chapter?.messages.length, chatBusy]);
  const updateChapter = useCallback(
    (videoId: string, chapterId: string, change: Partial<Chapter>) =>
      setVideo((v) =>
        v?.id === videoId
          ? {
              ...v,
              chapters: v.chapters.map((c) =>
                c.id === chapterId ? { ...c, ...change } : c,
              ),
            }
          : v,
      ),
    [],
  );
  const loadSummary = useCallback(
    async (v: Video, c: Chapter) => {
      if (c.summary) return;
      setSummaryBusy(`${v.id}/${c.id}`);
      try {
        const answer = await api<Answer>(`videos/${v.id}/summary`, {
          chapterId: c.id,
        });
        updateChapter(v.id, c.id, { summary: answer });
      } catch (e) {
        if (active.current?.id === v.id) setError((e as Error).message);
      } finally {
        setSummaryBusy((current) =>
          current === `${v.id}/${c.id}` ? null : current,
        );
      }
    },
    [updateChapter],
  );
  useEffect(() => {
    if (video && chapter && !chapter.summary) void loadSummary(video, chapter);
  }, [video?.id, chapter?.id, loadSummary]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!video) return;
    const id = video.id;
    const timer = setInterval(() => {
      void api(`videos/${id}/progress`, {
        chapter: selectedRef.current,
        position: position.current,
      }).catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [video?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function prepare(v: Video) {
    setPreparing(true);
    const timer = setInterval(() => {
      api<Video>(`videos/${v.id}`)
        .then((next) => {
          setVideo((old) => (old?.id === v.id ? next : old));
        })
        .catch(() => {});
    }, 3000);
    try {
      const next = await api<Video>(`videos/${v.id}/outline`, {});
      setVideo((old) => (old?.id === v.id ? next : old));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setPreparing(false);
      refresh();
    }
  }
  function enter(v: Video, reused: boolean) {
    setError("");
    setSelected(v.selectedChapter || 0);
    position.current =
      v.position || v.chapters[v.selectedChapter || 0]?.start || 0;
    setVideo(v);
    setQuestion("");
    setTab("explanation");
    history.replaceState(null, "", `?video=${v.id}`);
    localStorage.setItem("mindora-last-video", v.id);
    if (!v.chapters.length) void prepare(v);
  }
  const enterRef = useRef(enter);
  enterRef.current = enter;
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("video");
    if (id && /^[\w-]{11}$/.test(id)) {
      setImporting(true);
      api<Video>(`videos/${id}`)
        .then((v) => enterRef.current(v, true))
        .catch((e) => setError(e.message))
        .finally(() => setImporting(false));
    }
  }, []);
  async function importVideo(event: React.FormEvent) {
    event.preventDefault();
    setImporting(true);
    setError("");
    try {
      const trimmedTranscript = manualTranscript.trim();
      const result = await api<{ video: Video; reused: boolean }>("import", {
        url,
        ...(trimmedTranscript ? { transcript: trimmedTranscript } : {}),
      });
      setManualTranscript("");
      setShowTranscript(false);
      enter(result.video, result.reused);
      refresh();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (/transcript|caption|blocked|429|refused/i.test(message)) {
        setShowTranscript(true);
        setTimeout(() => transcriptRef.current?.focus(), 50);
      }
    } finally {
      setImporting(false);
    }
  }
  async function openSession(id: string) {
    setImporting(true);
    setError("");
    try {
      enter(await api<Video>(`videos/${id}`), true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }
  function seek(n: number) {
    position.current = n;
    seekRef.current?.(n);
    if (video)
      void api(`videos/${video.id}/progress`, {
        chapter: selected,
        position: n,
      }).catch(() => {});
  }
  function selectChapter(index: number) {
    if (!video) return;
    setSelected(index);
    setOutlineOpen(false);
    setQuestion("");
    setError("");
    seek(video.chapters[index].start);
    void api(`videos/${video.id}/progress`, {
      chapter: index,
      position: video.chapters[index].start,
    }).catch(() => {});
  }
  function leave() {
    if (video)
      void api(`videos/${video.id}/progress`, {
        chapter: selected,
        position: position.current,
      }).catch(() => {});
    setVideo(null);
    setError("");
    history.replaceState(null, "", "/");
    refresh();
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!video || !chapter || !question.trim() || chatBusy) return;
    const q = question.trim();
    setQuestion("");
    await sendQuestion(q, createRequestId());
  }
  async function sendQuestion(q: string, requestId: string) {
    if (!video || !chapter || chatBusy) return;
    const v = video,
      c = chapter;
    setPendingChat({ videoId: v.id, chapterId: c.id, question: q, requestId });
    setChatBusy(`${v.id}/${c.id}`);
    setError("");
    try {
      const message = await api<Chapter["messages"][number]>(
        `videos/${v.id}/chat`,
        { chapterId: c.id, question: q, requestId },
      );
      setVideo((old) =>
        old?.id === v.id
          ? {
              ...old,
              chapters: old.chapters.map((ch) =>
                ch.id === c.id
                  ? {
                      ...ch,
                      messages: [
                        ...ch.messages.filter((m) => m.id !== message.id),
                        message,
                      ],
                    }
                  : ch,
              ),
            }
          : old,
      );
      setPendingChat(null);
    } catch (e) {
      setPendingChat({
        videoId: v.id,
        chapterId: c.id,
        question: q,
        requestId,
        error: (e as Error).message,
      });
    } finally {
      setChatBusy(null);
    }
  }
  return (
    <div className={video ? "app study-app" : "app"}>
      <header className="topbar">
        <button
          className="brand"
          onClick={leave}
          aria-label="Mindora home"
        >
          <span className="brand-mark">
            <MindoraLogo />
          </span>
          <span>Mindora</span>
        </button>
        {!video && (
          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a className="nav-cta" href="#start-learning">
              Start learning
            </a>
            <Link
              className="github-link"
              href={"https://github.com/rohan-bhau/mondora"}
              target="_blank"
              rel="noreferrer"
              aria-label="View Mindora on GitHub"
            >
              <Icon name="github" size={19} />
            </Link>
          </nav>
        )}
      </header>
      {error && (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      {!video ? (
        <main className="import-main">
          <section
            id="start-learning"
            className="home-introduction"
            aria-label="Start learning"
          >
            <div className="hero-stars" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className="hero-copy">
              <span className="hero-eyebrow">
                LEARN FROM THE VIDEOS YOU ALREADY WATCH
              </span>
              <h1>
                Turn any lesson into a classroom that <em>talks back.</em>
              </h1>
              <p className="hero-description">
                Study a YouTube video chapter by chapter. Get a clear
                explanation, ask follow-up questions, and return to the exact
                moment that supports an answer.
              </p>
            </div>
            <form onSubmit={importVideo} className="import-card">
              <label className="sr-only" htmlFor="youtube-url">
                YouTube video URL
              </label>
              <div className="hero-composer">
                <div className="url-input">
                  <Icon name="link" size={21} />
                  <input
                    id="youtube-url"
                    name="url"
                    type="url"
                    required
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Paste a YouTube video link"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={importing}
                  />
                </div>
                <button
                  type="submit"
                  className="primary hero-submit"
                  disabled={
                    importing ||
                    !url.trim() ||
                    (showTranscript && !manualTranscript.trim())
                  }
                >
                  {importing ? (
                    <>
                      <span className="spinner" />
                      Importing…
                    </>
                  ) : (
                    <>
                      Create study session
                      <Icon name="arrow" size={17} />
                    </>
                  )}
                </button>
              </div>
              <div className="transcript-actions">
                <button
                  type="button"
                  className="transcript-toggle"
                  aria-expanded={showTranscript}
                  aria-controls="manual-transcript-panel"
                  onClick={() => setShowTranscript((open) => !open)}
                >
                  <Icon name="book" size={14} />
                  {showTranscript
                    ? "Hide manual transcript"
                    : "Paste transcript manually"}
                </button>
              </div>
              {showTranscript && (
                <div id="manual-transcript-panel" className="transcript-panel">
                  <label htmlFor="manual-transcript">Video transcript</label>
                  <p id="transcript-help" className="transcript-help">
                    On YouTube, open the video description, click{" "}
                    <strong>Show transcript</strong>, then copy and paste it
                    here (timestamps or .srt/.vtt supported).
                  </p>
                  <textarea
                    ref={transcriptRef}
                    id="manual-transcript"
                    name="transcript"
                    rows={6}
                    maxLength={500000}
                    aria-describedby="transcript-help"
                    placeholder={"0:00\nIntroduction to the lesson...\n0:18\nCore concept explained..."}
                    value={manualTranscript}
                    onChange={(e) => {
                      setManualTranscript(e.target.value);
                      if (error) setError("");
                    }}
                    disabled={importing}
                  />
                </div>
              )}
            </form>
            <div className="hero-outcomes" aria-label="Learning tools">
              <span>
                <Icon name="book" size={15} /> Chapter summaries
              </span>
              <span>
                <Icon name="link" size={15} /> Timestamped answers
              </span>
              <span>
                <Icon name="chat" size={15} /> A tutor that remembers
              </span>
            </div>
            <div className="hero-steps" aria-label="How a study session works">
              <span>
                <b>01</b>
                <span>
                  <strong>Paste a captioned video</strong>
                  <small>Import its lessons and timeline.</small>
                </span>
              </span>
              <span>
                <b>02</b>
                <span>
                  <strong>Choose a chapter</strong>
                  <small>Start with the part you need.</small>
                </span>
              </span>
              <span>
                <b>03</b>
                <span>
                  <strong>Learn through follow-ups</strong>
                  <small>Ask, clarify, and replay key moments.</small>
                </span>
              </span>
            </div>
          </section>
          {sessions.length > 0 && (
            <section className="recent">
              <div className="section-heading">
                <h2>Saved sessions</h2>
                <span>
                  {sessions.length} saved{" "}
                  {sessions.length === 1 ? "session" : "sessions"}
                </span>
              </div>
              <div className="session-grid">
                {sessions.map((s) => (
                  <button
                    className="session-card"
                    key={s.id}
                    onClick={() => openSession(s.id)}
                    disabled={importing}
                  >
                    <span className="session-art">
                      {/* YouTube serves these public thumbnails directly; no image proxy is needed. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://i.ytimg.com/vi/${s.id}/maxresdefault.jpg`}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          const image = event.currentTarget;
                          if (!image.src.endsWith("/hqdefault.jpg"))
                            image.src = `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`;
                          else image.style.visibility = "hidden";
                        }}
                      />
                      <span>{time(s.duration)}</span>
                    </span>
                    <span className="session-info">
                      <small>{s.author}</small>
                      <strong>{s.title}</strong>
                      <span>
                        {s.chapterCount
                          ? `${s.chapterCount} chapters`
                          : "Outline in progress"}
                        <Icon name="arrow" size={15} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section
            className="landing-section product-tour"
            aria-labelledby="product-tour-title"
          >
            <div className="landing-heading centered">
              <span>Built around the lesson</span>
              <h2 id="product-tour-title">
                Everything you need to go from watching to understanding.
              </h2>
              <p>
                Move through the lesson chapter by chapter, replay the exact
                moment, and keep your questions and notes beside the video.
              </p>
            </div>
            <div
              className="product-preview"
              aria-label="Mindora study interface preview"
            >
              <div className="preview-bar">
                <span />
                <span />
                <span />
                <small>Study session</small>
              </div>
              <div className="preview-layout">
                <div className="preview-chapters">
                  <strong>Chapters</strong>
                  <span className="active">
                    <b>01</b> The core idea
                  </span>
                  <span>
                    <b>02</b> Why context matters
                  </span>
                  <span>
                    <b>03</b> Building the solution
                  </span>
                  <span>
                    <b>04</b> Putting it together
                  </span>
                </div>
                <div className="preview-lesson">
                  <div className="preview-video">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${sessions[0]?.id || "S2yuw4qzlxM"}/maxresdefault.jpg`}
                      alt="Generative AI system design lesson"
                      loading="lazy"
                      onError={(event) => {
                        const image = event.currentTarget;
                        if (!image.src.endsWith("/hqdefault.jpg"))
                          image.src = `https://i.ytimg.com/vi/${sessions[0]?.id || "S2yuw4qzlxM"}/hqdefault.jpg`;
                      }}
                    />
                    <span>
                      <Icon name="play" size={22} />
                    </span>
                  </div>
                  <small>CHAPTER 01</small>
                  <strong>Understand the idea, not just the words</strong>
                  <p>
                    A connected explanation follows the instructor’s reasoning
                    from the problem to the takeaway.
                  </p>
                  <div className="preview-timeline">
                    <Icon name="link" size={14} /> Replay the supporting moment{" "}
                    <b>1:24</b>
                  </div>
                </div>
                <div className="preview-tutor">
                  <strong>AI tutor</strong>
                  <small>Ask anything</small>
                  <div className="preview-question">
                    Why does this approach work?
                  </div>
                  <p>
                    It separates the work into smaller responsibilities, so each
                    part can change without breaking the whole system.
                  </p>
                  <div className="preview-input">
                    Ask a follow-up… <Icon name="arrow" size={15} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            id="features"
            className="landing-section feature-section"
            aria-labelledby="features-title"
          >
            <div className="landing-heading">
              <span>A better way to study video</span>
              <h2 id="features-title">
                Watch less passively. Learn more deliberately.
              </h2>
            </div>
            <div className="feature-grid">
              <article>
                <span className="feature-icon">
                  <Icon name="book" />
                </span>
                <h3>Clear chapter stories</h3>
                <p>
                  Turn each lesson into one connected, beginner-friendly
                  explanation of what is being taught and why it matters.
                </p>
              </article>
              <article>
                <span className="feature-icon">
                  <Icon name="chat" />
                </span>
                <h3>A tutor that follows you</h3>
                <p>
                  Ask natural follow-up questions with the active chapter and
                  conversation already in context.
                </p>
              </article>
              <article>
                <span className="feature-icon">
                  <Icon name="clock" />
                </span>
                <h3>Answers tied to moments</h3>
                <p>
                  Use timeline links to jump back to the supporting explanation
                  without losing your conversation.
                </p>
              </article>
              <article>
                <span className="feature-icon">
                  <Icon name="volume" />
                </span>
                <h3>Listen while you learn</h3>
                <p>
                  Hear summaries and tutor replies in a natural system voice
                  with synchronized word highlighting.
                </p>
              </article>
              <article>
                <span className="feature-icon">
                  <Icon name="book" />
                </span>
                <h3>Notes for every chapter</h3>
                <p>
                  Capture what matters in the moment. Your notes stay attached
                  to the chapter when you return.
                </p>
              </article>
              <article>
                <span className="feature-icon">
                  <Icon name="check" />
                </span>
                <h3>Your progress stays saved</h3>
                <p>
                  Reopen an imported video and continue with its outline,
                  summaries, conversations, and notes intact.
                </p>
              </article>
            </div>
          </section>

          <section
            id="how-it-works"
            className="landing-section how-section"
            aria-labelledby="how-title"
          >
            <div className="landing-heading centered">
              <span>From link to lesson</span>
              <h2 id="how-title">Your classroom is ready in three steps.</h2>
            </div>
            <div className="steps-grid">
              <article>
                <b>01</b>
                <div>
                  <h3>Paste a YouTube link</h3>
                  <p>
                    Mindora imports the metadata and timestamped
                    captions.
                  </p>
                </div>
              </article>
              <article>
                <b>02</b>
                <div>
                  <h3>Choose a chapter</h3>
                  <p>
                    Creator chapters are preserved, or a grounded outline is
                    created from topic changes.
                  </p>
                </div>
              </article>
              <article>
                <b>03</b>
                <div>
                  <h3>Study with your tutor</h3>
                  <p>
                    Read the summary, replay key moments, ask questions, and
                    save your own notes.
                  </p>
                </div>
              </article>
            </div>
          </section>

          <section
            className="landing-section study-types"
            aria-labelledby="study-types-title"
          >
            <div className="study-types-copy">
              <span>Made for ideas worth keeping</span>
              <h2 id="study-types-title">
                More than a summary. A place to actually study.
              </h2>
              <p>
                Use Mindora when a video deserves more than a quick
                watch. The lesson stays organized, searchable through
                conversation, and ready when you come back.
              </p>
            </div>
            <div className="study-type-list">
              <article>
                <Icon name="book" />
                <div>
                  <b>Courses & lectures</b>
                  <span>Follow an argument across clear lessons.</span>
                </div>
              </article>
              <article>
                <Icon name="monitor" />
                <div>
                  <b>Technical deep dives</b>
                  <span>Pause, question, and revisit complex ideas.</span>
                </div>
              </article>
              <article>
                <Icon name="chat" />
                <div>
                  <b>System design talks</b>
                  <span>Understand why each decision was made.</span>
                </div>
              </article>
            </div>
          </section>

          <section className="landing-section final-cta">
            <span>Ready for your next lesson?</span>
            <h2>
              Turn the video you saved for later into something you understand
              today.
            </h2>
            <a href="#start-learning" className="primary">
              Create a study session <Icon name="arrow" size={17} />
            </a>
          </section>

          <footer className="site-footer">
            <div className="footer-inner">
              <div className="footer-brand">
                <span className="brand-mark">
                  <MindoraLogo />
                </span>
                <strong>Mindora</strong>
              </div>
              <p>Turn YouTube videos into your personal classroom.</p>
              <nav aria-label="Footer navigation">
                <a href="#features">Features</a>
                <a href="#how-it-works">How it works</a>
                <a href="#start-learning">Start learning</a>
              </nav>
              <small>Copyright © 2026 Mindora.</small>
            </div>
          </footer>
        </main>
      ) : (
        <>
          <div className="workspace-bar">
            <button className="text-button" onClick={leave}>
              <Icon name="back" size={15} />
              All sessions
            </button>
            <span className="workspace-breadcrumb">
              My workspace <span>/</span> Study session
            </span>
            <span className="saved-label">
              <Icon name="check" size={13} />
              Saved
            </span>
          </div>
          <div className="study-layout">
            <aside className={`outline-panel ${outlineOpen ? "open" : ""}`}>
              <div className="outline-heading">
                <button
                  className="outline-close"
                  onClick={() => setOutlineOpen(false)}
                  aria-label="Close chapter outline"
                >
                  <Icon name="close" size={18} />
                </button>
                <h2>Chapters</h2>
                <p>
                  {video.chapters.length} chapters <span>·</span>{" "}
                  {time(video.duration)}
                </p>
              </div>
              {video.chapters.map((c, i) => (
                <button
                  key={c.id}
                  className={`chapter-button ${selected === i ? "selected" : ""}`}
                  onClick={() => selectChapter(i)}
                  aria-current={selected === i ? "step" : undefined}
                >
                  <span className="chapter-number">
                    {selected === i ? (
                      <Icon name="play" size={12} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="chapter-meta">
                    <strong>{c.title}</strong>
                    <span>
                      {time(c.start)}{" "}
                      <span className="chapter-duration">
                        / {time(c.end - c.start)}
                      </span>
                      {c.source === "ai" && <span className="ai-tag">AI</span>}
                    </span>
                  </span>
                  {c.summary && (
                    <Icon name="check" size={12} className="chapter-done" />
                  )}
                </button>
              ))}
              {!video.chapters.length && (
                <div className="outline-loading">
                  <span className="spinner" />
                  <p>
                    {preparing
                      ? "Finding topic changes…"
                      : "Your outline is not ready yet."}
                  </p>
                  <small>
                    {video.outlineProgress} of {video.outlineTotal} transcript
                    parts saved
                  </small>
                  {!preparing && (
                    <button
                      onClick={() => prepare(video)}
                      className="text-button"
                    >
                      Continue chaptering <Icon name="arrow" size={14} />
                    </button>
                  )}
                </div>
              )}
            </aside>
            <main className="study-main">
              <button
                className="mobile-outline"
                onClick={() => setOutlineOpen(!outlineOpen)}
              >
                <Icon name="book" size={16} />
                Chapters ({video.chapters.length})<Icon name="down" size={15} />
              </button>
              <div className="video-heading">
                <h1>{video.title}</h1>
                <div className="video-byline">
                  <span className="author-avatar">{video.author[0]}</span>
                  <strong>{video.author}</strong>
                  <span>·</span>
                  <span>{time(video.duration)}</span>
                  <span>·</span>
                  <span>
                    {video.automatic ? "Auto-generated" : "Manual"} captions ·{" "}
                    {video.language}
                  </span>
                </div>
              </div>
              <div className="learning-grid">
                <div className="lesson-column">
                  <VideoPlayer
                    key={video.id}
                    id={video.id}
                    start={position.current}
                    onPosition={(n) => {
                      position.current = n;
                    }}
                    onSeekReady={(fn) => {
                      seekRef.current = fn;
                    }}
                  />
                  {chapter ? (
                    <>
                      <div className="current-chapter">
                        <span className="overline">
                          Chapter {String(selected + 1).padStart(2, "0")} of{" "}
                          {String(video.chapters.length).padStart(2, "0")}
                        </span>
                        <button
                          className="timestamp"
                          onClick={() => seek(chapter.start)}
                        >
                          <Icon name="play" size={11} />
                          {time(chapter.start)} – {time(chapter.end)}
                        </button>
                      </div>
                      <h2 className="lesson-title">{chapter.title}</h2>
                      <div className="lesson-tabs">
                        <button
                          className={tab === "explanation" ? "active" : ""}
                          onClick={() => setTab("explanation")}
                        >
                          Summary
                        </button>
                        <button
                          className={tab === "transcript" ? "active" : ""}
                          onClick={() => setTab("transcript")}
                        >
                          <Icon name="link" size={14} />
                          Timeline Preview
                        </button>
                      </div>
                      {chapter.summary ? (
                        tab === "explanation" ? (
                          <div
                            className="claims chapter-summary"
                            aria-label="Chapter summary"
                          >
                            <ReadableParagraph
                              text={chapter.summary.claims
                                .filter((claim) => claim.kind === "video")
                                .map((claim) => claim.text.trim())
                                .join(" ")}
                              label="chapter summary"
                            />
                          </div>
                        ) : (
                          <div className="source-excerpts">
                            <p className="muted-copy">
                              Preview moments from this chapter. Select a
                              timestamp to replay.
                            </p>
                            {[
                              ...new Map(
                                chapter.summary.claims
                                  .flatMap((c) => c.evidence)
                                  .map((e) => [e.id, e]),
                              ).values(),
                            ]
                              .sort((a, b) => a.start - b.start)
                              .map((e) => (
                                <div key={e.id}>
                                  <button
                                    className="timestamp"
                                    onClick={() => seek(e.start)}
                                  >
                                    {time(e.start)}
                                    <Icon name="play" size={10} />
                                  </button>
                                  <p>{e.text}</p>
                                </div>
                              ))}
                          </div>
                        )
                      ) : (
                        <div className="summary-loading">
                          <h3>
                            {summaryBusy === `${video.id}/${chapter.id}`
                              ? "Generating chapter summary…"
                              : "Generate a summary of this chapter."}
                          </h3>
                          <p>
                            Summarizing this chapter’s captions. Your summary
                            will be saved.
                          </p>
                          {summaryBusy !== `${video.id}/${chapter.id}` && (
                            <button
                              className="primary"
                              onClick={() => loadSummary(video, chapter)}
                            >
                              Generate summary
                              <Icon name="arrow" size={15} />
                            </button>
                          )}
                          {summaryBusy === `${video.id}/${chapter.id}` && (
                            <span className="loading-line" />
                          )}
                        </div>
                      )}
                      <StudyNotes
                        key={`${video.id}/${chapter.id}`}
                        videoId={video.id}
                        chapterId={chapter.id}
                      />
                      <div className="lesson-pagination">
                        <span>
                          {selected + 1} / {video.chapters.length} chapters
                        </span>
                        {selected < video.chapters.length - 1 ? (
                          <button
                            className="text-button"
                            onClick={() => selectChapter(selected + 1)}
                          >
                            Next chapter
                            <Icon name="arrow" size={15} />
                          </button>
                        ) : (
                          <span className="finish-label">
                            <Icon name="check" size={15} />
                            You’ve reached the final chapter
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="summary-loading">
                      <Icon name="book" size={25} />
                      <h3>Generating chapters…</h3>
                      <p>
                        You can start studying as soon as the chapter outline is
                        ready.
                        <br />
                        No need to wait for chapter summaries.
                      </p>
                    </div>
                  )}
                </div>
                <section className="tutor-panel" aria-label="Chapter tutor">
                  <div className="tutor-heading">
                    <div>
                      <h2>Your AI tutor</h2>
                    </div>
                  </div>
                  <div className="tutor-context">
                    <span className="context-dot" />
                    <span>
                      {chapter
                        ? `Chapter ${String(selected + 1).padStart(2, "0")} · Ask anything`
                        : "Waiting for your outline"}
                    </span>
                    <Icon name="lock" size={11} />
                  </div>
                  <div className="chat-scroll">
                    {(!chapter || chapter.messages.length === 0) &&
                      !(
                        pendingChat?.videoId === video.id &&
                        pendingChat.chapterId === chapter?.id
                      ) && (
                        <div className="chat-welcome">
                          <h3>Ask about this chapter</h3>
                          <p>
                            Explore the lesson, ask for examples, or take the
                            conversation further.
                          </p>
                          <div className="suggestions">
                            {[
                              "What’s the main idea here?",
                              "Why did we do it this way?",
                              "Explain it with a simple example.",
                            ].map((q) => (
                              <button
                                key={q}
                                onClick={() => setQuestion(q)}
                                disabled={!chapter}
                              >
                                <span>{q}</span>
                                <Icon name="arrow" size={13} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    {chapter?.messages.map((m) => (
                      <div className="chat-exchange" key={m.id}>
                        <div className="user-message">
                          <span>You</span>
                          <p>{m.question}</p>
                        </div>
                        <div className="assistant-message">
                          <span className="assistant-label">Tutor</span>
                          <Claims answer={m.answer} seek={seek} compact />
                        </div>
                      </div>
                    ))}
                    {pendingChat?.videoId === video.id &&
                      pendingChat.chapterId === chapter?.id && (
                        <div className="chat-exchange">
                          <div className="user-message">
                            <span>You</span>
                            <p>{pendingChat.question}</p>
                          </div>
                          {pendingChat.error ? (
                            <div className="chat-retry" role="alert">
                              <p>Couldn’t get a reply. {pendingChat.error}</p>
                              <button
                                className="text-button"
                                disabled={Boolean(chatBusy)}
                                onClick={() =>
                                  sendQuestion(
                                    pendingChat.question,
                                    pendingChat.requestId,
                                  )
                                }
                              >
                                Retry
                              </button>
                            </div>
                          ) : (
                            <div
                              className="thinking"
                              role="status"
                              aria-live="polite"
                            >
                              <span className="spinner" />
                              AI is replying…
                            </div>
                          )}
                        </div>
                      )}
                    <div ref={chatEnd} />
                  </div>
                  <form className="chat-form" onSubmit={ask}>
                    <label htmlFor="question" className="sr-only">
                      Ask about this chapter
                    </label>
                    <textarea
                      id="question"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Ask a question or explore an idea…"
                      maxLength={2000}
                      rows={2}
                      disabled={!chapter}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <div>
                      <span>Enter to send · Shift + Enter for a new line</span>
                      <button
                        type="submit"
                        aria-label="Send question"
                        disabled={
                          !chapter || !question.trim() || Boolean(chatBusy)
                        }
                      >
                        <Icon name="arrow" size={18} />
                      </button>
                    </div>
                  </form>
                  <p className="tutor-disclaimer">
                    AI can make mistakes. Replay the source to check.
                  </p>
                </section>
              </div>
            </main>
          </div>
        </>
      )}
    </div>
  );
}
