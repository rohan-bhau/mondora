"use client";
import { useCallback, useEffect, useState } from "react";
import type { LearningNote } from "@/lib/types";
export function StudyNotes({
  videoId,
  chapterId,
}: {
  videoId: string;
  chapterId: string;
}) {
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          `/api/studio/videos/${encodeURIComponent(videoId)}/notes`,
          { cache: "no-store", signal },
        );
        if (!r.ok) throw new Error("Could not load learning notes.");
        const data: LearningNote[] = await r.json();
        if (!signal?.aborted) {
          const chapterNotes = data.filter((n) => n.chapterId === chapterId);
          setNotes(chapterNotes);
          setDraft(
            chapterNotes.find((n) => n.title === "My notes")?.body || "",
          );
        }
      } catch (e) {
        if (!signal?.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load learning notes.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [videoId, chapterId],
  );
  useEffect(() => {
    const controller = new AbortController();
    setNotes([]);
    void refresh(controller.signal);
    const focus = () => void refresh(controller.signal);
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function save() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const r = await fetch(
        `/api/studio/videos/${encodeURIComponent(videoId)}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId, body }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not save your note.");
      setNotes((current) => [
        ...current.filter((n) => n.title !== "My notes"),
        data,
      ]);
      setDraft(data.body);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your note.");
    } finally {
      setSaving(false);
    }
  }
  const personal = notes.find((note) => note.title === "My notes");
  const additional = notes.filter((note) => note.title !== "My notes");
  const changed = draft.trim() !== (personal?.body || "");
  return (
    <section className="study-notes" aria-label="Learning notes">
      <div className="section-heading">
        <div>
          <h3>Learning notes</h3>
          <p className="muted-copy">Keep your own notes for this chapter.</p>
        </div>
        <span aria-live="polite">
          {loading
            ? "Loading…"
            : saving
              ? "Saving…"
              : saved && !changed
                ? "Saved"
                : ""}
        </span>
      </div>
      <label className="note-editor">
        <span className="sr-only">Your chapter notes</span>
        <textarea
          value={draft}
          maxLength={10000}
          onChange={(event) => {
            setDraft(event.target.value);
            setSaved(false);
          }}
          placeholder="Write what you want to remember…"
        />
      </label>
      <div className="note-actions">
        <span>{draft.length.toLocaleString()} / 10,000</span>
        <button
          className="primary"
          disabled={!draft.trim() || !changed || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
      {additional.length > 0 && (
        <div className="additional-notes">
          <h4>Additional notes</h4>
          {additional.map((note) => (
            <article key={note.documentId}>
              <h4>{note.title}</h4>
              <p>{note.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
