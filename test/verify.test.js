import { test } from "node:test";
import assert from "node:assert/strict";

// Set config-affecting env BEFORE importing the module under test.
process.env.CONFIDENCE_THRESHOLD = "0.7";
process.env.OPENAI_API_KEY = "test-key";
const { verifyCutPoint } = await import("../src/verify.js");

function mockClient(payload, { throwErr = false } = {}) {
  return {
    chat: {
      completions: {
        create: async () => {
          if (throwErr) throw new Error("api down");
          return { choices: [{ message: { content: JSON.stringify(payload) } }] };
        },
      },
    },
  };
}

test("confident when reading-start true and confidence >= threshold", async () => {
  const client = mockClient({ isReadingStart: true, confidence: 0.92, reason: "clear" });
  const r = await verifyCutPoint({ windowText: "...", candidateStart: 120 }, { client });
  assert.equal(r.confident, true);
  assert.equal(r.startSeconds, 120);
});

test("not confident when confidence below threshold", async () => {
  const client = mockClient({ isReadingStart: true, confidence: 0.4, reason: "maybe" });
  const r = await verifyCutPoint({ windowText: "...", candidateStart: 120 }, { client });
  assert.equal(r.confident, false);
});

test("not confident when isReadingStart is false even with high confidence", async () => {
  const client = mockClient({ isReadingStart: false, confidence: 0.99, reason: "no" });
  const r = await verifyCutPoint({ windowText: "...", candidateStart: 120 }, { client });
  assert.equal(r.confident, false);
});

test("fails safe (not confident) when the API throws", async () => {
  const client = mockClient({}, { throwErr: true });
  const r = await verifyCutPoint({ windowText: "...", candidateStart: 77 }, { client });
  assert.equal(r.confident, false);
  assert.equal(r.confidence, 0);
  assert.equal(r.startSeconds, 77);
});
