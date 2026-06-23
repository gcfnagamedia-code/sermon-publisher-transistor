// Tracks which videos have already been published, persisted in processed.json.
// The GitHub Actions workflow commits this file back to the repo after a
// successful run so state survives the ephemeral runner.

import { readFile, writeFile } from "node:fs/promises";
import { config } from "./config.js";

async function load(file) {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // missing/corrupt file -> treat as empty
  }
}

/** True if this videoId has already been processed. */
export async function isProcessed(videoId, file = config.stateFile) {
  const ids = await load(file);
  return ids.includes(videoId);
}

/** Record a videoId as processed (idempotent). Call only after full success. */
export async function markProcessed(videoId, file = config.stateFile) {
  const ids = await load(file);
  if (!ids.includes(videoId)) {
    ids.push(videoId);
    await writeFile(file, JSON.stringify(ids, null, 2) + "\n");
  }
}
