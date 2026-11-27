import type {Answer, Claim, Evidence, Chapter, StoredVideo, Message, ModelOutput, YouTubeMetadata} from './types';
export function videoId(input: string) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Paste a valid YouTube URL.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use a YouTube URL.');
  const host = url.hostname.toLowerCase().replace(/^www\./,'');
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (['youtube.com','m.youtube.com','music.youtube.com'].includes(host)) id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1];
  if (!/^[\w-]{11}$/.test(id || '')) throw new Error('This does not look like a YouTube video URL.');
  return id!;
}
export function parseTime(value: string) { return value.split(':').reduce((n, p) => n * 60 + Number(p), 0); }
export function creatorChapters(metadata: YouTubeMetadata, duration: number): Chapter[] {
  // YouTube also exposes automatic chapters as metadata.chapters. Only description
  // markers establish creator provenance; use metadata to preserve matching titles.
  let markers: {start:number;title:string;source?:Chapter['source']}[] = [...(metadata.description || '').matchAll(/^[^\d\n]*?(?:\[|\()?((?:\d+:)?\d{1,2}:\d{2})(?:\]|\))?\s*[-–—|:]?\s+(.+?)\s*$/gm)].map(m => ({ start: parseTime(m[1]), title: m[2] }));
  markers = markers.map(marker => {
    const native = (metadata.chapters || []).find(c => Math.abs(Number(c.start_time)-marker.start)<0.1);
    return native && typeof native.title === 'string' ? { ...marker, title:native.title } : marker;
  });
  markers = markers.filter(c => typeof c.title === 'string' && c.title.trim() && Number.isFinite(c.start) && c.start >= 0 && c.start < duration);
  if (markers.length < 2 || markers.some((c,i) => i && c.start <= markers[i-1].start)) return [];
  const source: Chapter['source'] = metadata.chapters?.length ? 'creator' : 'description';
  markers = markers.map(c => ({ ...c, source }));
  if (markers[0].start > 0) markers.unshift({ title:'Before the first chapter', start:0, source:'gap' });
  return markers.map((c,i) => ({ ...c, source:c.source || source, id:`chapter-${i}`, end:markers[i+1]?.start ?? duration, messages:[] }));
}
export function parseCaptions(data: {events?:{segs?:{utf8?:string}[];tStartMs:number;dDurationMs?:number}[]}): Evidence[] {
  const segments: Evidence[] = [];
  for (const e of data.events || []) {
    const text = (e.segs || []).map(s => s.utf8 || '').join('').replace(/\s+/g,' ').trim();
    const start = e.tStartMs / 1000;
    if (!text || !Number.isFinite(start) || start < 0) continue;
    const end = start + Math.max(0.001, (e.dDurationMs || 1000) / 1000);
    if (segments.at(-1)?.start === start && segments.at(-1)?.text === text) continue;
    // Hard-bound individual captions too: never discard an oversized final caption.
    for (let offset=0; offset<text.length; offset+=1600) segments.push({id:`s${segments.length}`,start,end,text:text.slice(offset,offset+1600)});
  }
  return segments.sort((a,b)=>a.start-b.start);
}
export function chunks(segments: Evidence[], limit = 10000): Evidence[][] {
  const result: Evidence[][] = []; let current: Evidence[] = [], size = 0;
  for (const segment of segments) {
    const cost = Buffer.byteLength(JSON.stringify(segment),'utf8') + 2;
    if (size + cost > limit && current.length) { result.push(current); current=[]; size=0; }
    current.push(segment); size += cost;
  }
  if (current.length) result.push(current);
  return result;
}
export function chapterSegments(video: Pick<StoredVideo,"segments">, chapter: Pick<Chapter,"start"|"end">): Evidence[] {
  // Include a caption crossing the boundary, with its original timestamp.
  return video.segments.filter(s => s.start < chapter.end && s.end > chapter.start);
}
export function groundClaims(output: ModelOutput, allowed: Evidence[]): Answer {
  if (!output || !Array.isArray(output.claims)) throw new Error('The local model returned an invalid answer. Please retry.');
  const byId = new Map(allowed.map(s => [s.id,s]));
  const claims = output.claims.slice(0,12).map((c): Claim | null => {
    const evidence = [...new Set(Array.isArray(c.segmentIds) ? c.segmentIds : [])].map(id => byId.get(id)).filter((s): s is Evidence => Boolean(s)).slice(0,4);
    if (typeof c.text !== 'string' || !c.text.trim()) return null;
    if (c.kind === 'video' && /[\"“”]|\b\d{1,3}:\d{2}\b|```/.test(c.text)) return null;
    if (c.kind === 'video' && !evidence.length) return null;
    if (!['video','additional','uncertain'].includes(c.kind || '')) return null;
    // Quotes and times only appear in evidence, copied directly from stored captions.
    return { kind:c.kind as Claim["kind"], text:c.text.slice(0,6000), evidence:c.kind === 'video' ? evidence : [] };
  }).filter((c): c is Claim => Boolean(c));
  if (!claims.length) throw new Error('The model did not return a supported explanation. Please retry.');
  return { claims };
}
export function retrieve(segments: Evidence[], question: string, history: Pick<Message,"question">[] = [], limit = 10000): Evidence[] {
  const query = [question, ...history.slice(-4).map(m=>m.question)].join(' ').toLowerCase();
  const terms = [...new Set(query.match(/[\p{L}\p{N}_]{3,}/gu) || [])];
  const passages = chunks(segments, 1200);
  const ranked = passages.map((p,i) => ({p,i,score:terms.reduce((n,t)=>n + p.filter(s=>s.text.toLowerCase().includes(t)).length,0)})).sort((a,b)=>b.score-a.score || a.i-b.i);
  // Topic title and distributed context keep anaphoric questions usable.
  const selected = new Map<string, Evidence>();
  for (const item of ranked.slice(0,5)) for (const s of item.p) selected.set(s.id,s);
  for (const p of [passages[0],passages[Math.floor(passages.length/2)],passages.at(-1)]) for (const s of p || []) selected.set(s.id,s);
  let bytes=0;
  return [...selected.values()].filter(s=>{const size=Buffer.byteLength(JSON.stringify(s),'utf8')+2;if(bytes+size>limit)return false;bytes+=size;return true;}).sort((a,b)=>a.start-b.start);
}
