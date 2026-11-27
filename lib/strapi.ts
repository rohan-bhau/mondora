import type { StoredVideo, LearningNote } from "./types";
export type VideoDocument = {
  documentId: string;
  youtubeId: string;
  payload: StoredVideo;
  updatedAt: string;
};
type Collection<T> = { data: T[] };
const base = () => process.env.STRAPI_URL || "http://127.0.0.1:1337";
async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  if (!process.env.STUDIO_TOKEN)
    throw new Error("Run npm run setup:local to configure the app.");
  let response: Response;
  try {
    response = await fetch(`${base()}/api/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.STUDIO_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify({ data }) }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Strapi is unavailable. Start the app with npm run dev.");
  }
  if (!response.ok)
    throw new Error(
      `Strapi could not ${method === "GET" ? "read" : "save"} content (${response.status}). Check the service logs and local configuration.`,
    );
  return response.json() as Promise<T>;
}
export async function findVideo(
  id: string,
): Promise<VideoDocument | undefined> {
  const result = await request<Collection<VideoDocument>>(
    `videos?filters[youtubeId][$eq]=${encodeURIComponent(id)}&pagination[pageSize]=1`,
  );
  return result.data[0];
}
export async function listVideos(): Promise<VideoDocument[]> {
  return (
    await request<Collection<VideoDocument>>(
      "videos?sort=updatedAt:desc&pagination[pageSize]=30",
    )
  ).data;
}
export async function createVideo(
  payload: StoredVideo,
): Promise<VideoDocument> {
  return (
    await request<{ data: VideoDocument }>("videos", "POST", {
      youtubeId: payload.id,
      payload,
    })
  ).data;
}
export async function saveVideo(
  documentId: string,
  payload: StoredVideo,
): Promise<void> {
  await request(`videos/${encodeURIComponent(documentId)}`, "PUT", { payload });
}
export async function learningNotes(id: string): Promise<LearningNote[]> {
  return (
    await request<Collection<LearningNote>>(
      `learning-notes?filters[youtubeId][$eq]=${encodeURIComponent(id)}&sort=createdAt:asc&pagination[pageSize]=100`,
    )
  ).data;
}
export async function saveLearningNote(
  youtubeId: string,
  chapterId: string,
  body: string,
): Promise<LearningNote> {
  const personal = (await learningNotes(youtubeId)).find(
    (note) => note.chapterId === chapterId && note.title === "My notes",
  );
  const data = { youtubeId, chapterId, title: "My notes", body };
  return (
    personal
      ? await request<{ data: LearningNote }>(
          `learning-notes/${encodeURIComponent(personal.documentId)}`,
          "PUT",
          data,
        )
      : await request<{ data: LearningNote }>("learning-notes", "POST", data)
  ).data;
}
export async function storageHealth(): Promise<boolean> {
  try {
    await request("videos?pagination[pageSize]=1&fields[0]=youtubeId");
    return true;
  } catch {
    return false;
  }
}
