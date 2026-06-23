import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  diceSimilarity,
  findCuePoint,
  extractWindow,
} from "../src/cuepoint.js";

const CUE = "In preparation for today's message, we shall be reading from the book of";

test("tokenize strips punctuation and lowercases", () => {
  assert.deepEqual(tokenize("Today's, Message!"), ["today", "s", "message"]);
});

test("diceSimilarity: identical -> 1, disjoint -> 0", () => {
  assert.equal(diceSimilarity(["a", "b"], ["a", "b"]), 1);
  assert.equal(diceSimilarity(["a"], ["b"]), 0);
});

test("findCuePoint: locates cue spread across chunks despite wording drift", () => {
  const chunks = [
    { text: "good morning everyone and welcome", start: 0, duration: 5 },
    { text: "let us settle our hearts", start: 60, duration: 5 },
    // "todays" (no apostrophe) is wording drift vs the configured cue
    { text: "in preparation for todays message we shall", start: 120, duration: 5 },
    { text: "be reading from the book of john chapter three", start: 125, duration: 5 },
  ];
  const hit = findCuePoint(chunks, CUE, { minScore: 0.6 });
  assert.ok(hit, "expected a cue hit");
  assert.equal(hit.start, 120);
  assert.ok(hit.score >= 0.6);
});

test("findCuePoint: returns null when cue absent", () => {
  const chunks = [
    { text: "the weather today is lovely", start: 0, duration: 5 },
    { text: "let us talk about gardening", start: 5, duration: 5 },
  ];
  assert.equal(findCuePoint(chunks, CUE, { minScore: 0.6 }), null);
});

test("findCuePoint: respects minScore threshold", () => {
  const chunks = [{ text: "in preparation for", start: 10, duration: 3 }];
  // Only a partial overlap; a high threshold should reject it.
  assert.equal(findCuePoint(chunks, CUE, { minScore: 0.9 }), null);
});

test("extractWindow: returns text within +/- window of center", () => {
  const chunks = [
    { text: "before", start: 0, duration: 5 },
    { text: "near-start", start: 100, duration: 5 },
    { text: "at-center", start: 120, duration: 5 },
    { text: "near-end", start: 140, duration: 5 },
    { text: "far", start: 300, duration: 5 },
  ];
  const w = extractWindow(chunks, 120, 25);
  assert.equal(w, "near-start at-center near-end");
});
