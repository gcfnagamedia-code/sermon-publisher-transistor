// Finds where the scripture reading begins by fuzzy-matching a spoken cue phrase
// (e.g. "In preparation for today's message, we shall be reading from the book of")
// against the transcript. Tolerant of caption wording drift and punctuation.
//
// Pure functions only — no I/O — so this is fully unit-testable.

/** Lowercase, strip punctuation, collapse whitespace, split into tokens. */
export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Sørensen–Dice coefficient over two token sets (0–1). */
export function diceSimilarity(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

/**
 * Build a flat list of { token, start } from transcript chunks, so a cue phrase
 * spanning multiple caption chunks can still be located to a single start time.
 */
function flattenTokens(chunks) {
  const flat = [];
  for (const chunk of chunks) {
    for (const token of tokenize(chunk.text)) {
      flat.push({ token, start: chunk.start });
    }
  }
  return flat;
}

/**
 * Locate the cue phrase in the transcript.
 *
 * @param {Array<{text:string,start:number,duration:number}>} chunks
 * @param {string} cuePhrase
 * @param {object} [opts]
 * @param {number} [opts.minScore=0.6] - minimum Dice similarity to count as a hit
 * @returns {{start:number, score:number}|null}
 */
export function findCuePoint(chunks, cuePhrase, opts = {}) {
  const minScore = opts.minScore ?? 0.6;
  const cueTokens = tokenize(cuePhrase);
  if (cueTokens.length === 0 || !Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }

  const flat = flattenTokens(chunks);
  if (flat.length === 0) return null;

  const cueSet = new Set(cueTokens);
  const windowSize = cueTokens.length;
  let best = { start: null, score: 0 };

  // Slide a window the length of the cue phrase across the transcript tokens.
  for (let i = 0; i + 1 <= flat.length; i++) {
    const slice = flat.slice(i, i + windowSize);
    if (slice.length === 0) break;
    const score = diceSimilarity(
      cueTokens,
      slice.map((s) => s.token)
    );
    if (score > best.score) {
      // Anchor the cut to where the cue words actually start within the window,
      // not at any leading filler tokens that happen to fall in the window.
      const firstCue = slice.find((s) => cueSet.has(s.token)) ?? slice[0];
      best = { start: firstCue.start, score };
    }
    if (i + windowSize >= flat.length) break;
  }

  return best.start !== null && best.score >= minScore ? best : null;
}

/**
 * Extract the transcript text within ±windowSeconds of a center time. Used to
 * give the LLM verifier focused context around the candidate cut point.
 */
export function extractWindow(chunks, centerStart, windowSeconds) {
  const lo = centerStart - windowSeconds;
  const hi = centerStart + windowSeconds;
  return chunks
    .filter((c) => c.start >= lo && c.start <= hi)
    .map((c) => c.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
