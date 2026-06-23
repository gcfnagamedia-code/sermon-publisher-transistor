import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChunks, fetchTranscript } from "../src/transcript.js";

test("normalizeChunks: classic (seconds) values pass through", () => {
  const raw = [
    { text: "hello", offset: 0, duration: 3 },
    { text: "world", offset: 3, duration: 4 },
    { text: "again", offset: 7, duration: 2 },
  ];
  const out = normalizeChunks(raw);
  assert.equal(out[1].start, 3);
  assert.equal(out[1].duration, 4);
});

test("normalizeChunks: srv3 (ms) values are divided by 1000", () => {
  // median duration well above 50 -> treated as milliseconds
  const raw = [
    { text: "a", offset: 0, duration: 3000 },
    { text: "b", offset: 3000, duration: 4000 },
    { text: "c", offset: 7000, duration: 2000 },
  ];
  const out = normalizeChunks(raw);
  assert.equal(out[1].start, 3);
  assert.equal(out[1].duration, 4);
});

test("normalizeChunks: trims and collapses whitespace in text", () => {
  const out = normalizeChunks([{ text: "  hello\n  world ", offset: 0, duration: 2 }]);
  assert.equal(out[0].text, "hello world");
});

test("normalizeChunks: empty input -> empty array", () => {
  assert.deepEqual(normalizeChunks([]), []);
  assert.deepEqual(normalizeChunks(null), []);
});

test("fetchTranscript: prefers en, returns normalized chunks", async () => {
  const calls = [];
  const fetcher = async (id, opts) => {
    calls.push(opts);
    return [{ text: "verse", offset: 1000, duration: 60000 }, { text: "two", offset: 61000, duration: 60000 }];
  };
  const out = await fetchTranscript("vid", { fetcher });
  assert.equal(calls[0].lang, "en");
  assert.equal(out[0].start, 1); // 1000ms -> 1s
});

test("fetchTranscript: returns null when all attempts throw", async () => {
  const fetcher = async () => {
    throw new Error("rate limited");
  };
  const out = await fetchTranscript("vid", { fetcher });
  assert.equal(out, null);
});

test("fetchTranscript: falls back to default track when en is empty", async () => {
  const fetcher = async (id, opts) => {
    if (opts && opts.lang === "en") return [];
    return [{ text: "fallback", offset: 0, duration: 3 }];
  };
  const out = await fetchTranscript("vid", { fetcher });
  assert.equal(out[0].text, "fallback");
});
