import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateIds, entryTime } from "../src/playlist.js";

test("candidateIds: takes head and tail, deduped", () => {
  const entries = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `v${n}` }));
  assert.deepEqual(candidateIds(entries, 3), ["v1", "v2", "v3", "v5", "v6", "v7"]);
});

test("candidateIds: small list dedupes overlap", () => {
  const entries = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(candidateIds(entries, 3), ["a", "b"]);
});

test("entryTime: prefers timestamp, falls back to upload_date", () => {
  assert.equal(entryTime({ timestamp: 1700000000, upload_date: "20230101" }), 1700000000);
  assert.equal(entryTime({ upload_date: "20240115" }), 20240115);
  assert.equal(entryTime({}), 0);
});

test("entryTime: upload_date ordering picks the newer date", () => {
  const older = { upload_date: "20240101" };
  const newer = { upload_date: "20240608" };
  assert.ok(entryTime(newer) > entryTime(older));
});
