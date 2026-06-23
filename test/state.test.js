import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isProcessed, markProcessed } from "../src/state.js";

test("state: dedup round-trips through the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "state-"));
  const file = join(dir, "processed.json");
  try {
    assert.equal(await isProcessed("abc", file), false);
    await markProcessed("abc", file);
    assert.equal(await isProcessed("abc", file), true);

    // idempotent: marking again doesn't duplicate or error
    await markProcessed("abc", file);
    assert.equal(await isProcessed("abc", file), true);

    assert.equal(await isProcessed("xyz", file), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("state: missing file is treated as empty", async () => {
  const file = join(tmpdir(), "definitely-missing-" + Date.now() + ".json");
  assert.equal(await isProcessed("any", file), false);
});
