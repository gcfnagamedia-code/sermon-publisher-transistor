// Pulls YouTube's existing caption track via the youtube-transcript package and
// normalizes it into chunks with start/duration expressed in SECONDS.
//
// Returns null (never throws) when captions are disabled, unavailable, or the
// request is rate-limited, so the caller can fall back to the LLM or to a draft.

import { YoutubeTranscript } from "youtube-transcript";

/**
 * Normalize raw transcript chunks to seconds.
 *
 * The library returns offset/duration in milliseconds for the srv3 caption
 * format and in seconds for the classic format. We detect which by looking at
 * the MEDIAN chunk duration: real caption chunks are only a few seconds long, so
 * a median above 50 can only mean the values are milliseconds.
 *
 * @param {Array<{text:string, offset:number, duration:number}>} raw
 * @returns {Array<{text:string, start:number, duration:number}>}
 */
export function normalizeChunks(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const durations = raw
    .map((c) => Number(c.duration) || 0)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  const median =
    durations.length === 0
      ? 0
      : durations[Math.floor(durations.length / 2)];

  const divisor = median > 50 ? 1000 : 1;

  return raw.map((c) => ({
    text: String(c.text ?? "").replace(/\s+/g, " ").trim(),
    start: (Number(c.offset) || 0) / divisor,
    duration: (Number(c.duration) || 0) / divisor,
  }));
}

/**
 * Fetch and normalize a transcript. Prefers the English track, then falls back
 * to whatever default track exists. Returns null on any failure.
 *
 * @param {string} videoId
 * @param {object} [deps] - injectable for testing
 * @returns {Promise<Array<{text:string,start:number,duration:number}>|null>}
 */
export async function fetchTranscript(videoId, deps = {}) {
  const fetcher = deps.fetcher ?? YoutubeTranscript.fetchTranscript.bind(YoutubeTranscript);

  // Try English first, then the default track.
  for (const opts of [{ lang: "en" }, undefined]) {
    try {
      const raw = await fetcher(videoId, opts);
      const chunks = normalizeChunks(raw);
      if (chunks.length > 0) return chunks;
    } catch {
      // captions disabled / unavailable / rate-limited — try next option
    }
  }
  return null;
}
