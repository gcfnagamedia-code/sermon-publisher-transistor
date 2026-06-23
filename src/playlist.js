// Finds the newest video in a YouTube playlist and returns its metadata, using
// yt-dlp only (no YouTube Data API key required).
//
// Playlists can be ordered oldest- or newest-first, so rather than assume a
// position we read the actual upload dates of the entries at both ends of the
// playlist and pick the most recent.

import { spawn } from "node:child_process";

function runCapture(cmd, args, deps = {}) {
  const spawnFn = deps.spawn ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnFn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} failed (${code}): ${err}`))
    );
  });
}

function cookieArgs(cookiesFile) {
  return cookiesFile ? ["--cookies", cookiesFile] : [];
}

/** Pick the candidate entry ids to inspect: the first few and last few. */
export function candidateIds(entries, edge = 3) {
  const ids = entries.map((e) => e.id).filter(Boolean);
  const head = ids.slice(0, edge);
  const tail = ids.slice(-edge);
  return [...new Set([...head, ...tail])];
}

/** Parse yt-dlp upload_date (YYYYMMDD) / timestamp into a comparable number. */
export function entryTime(meta) {
  if (meta.timestamp) return Number(meta.timestamp);
  if (meta.upload_date) return Number(meta.upload_date); // YYYYMMDD sorts correctly
  return 0;
}

/**
 * @param {string} playlistId
 * @param {object} [opts] - { cookiesFile }
 * @param {object} [deps] - injectable for testing
 * @returns {Promise<{id:string,title:string,description:string}|null>}
 */
export async function getNewestVideo(playlistId, opts = {}, deps = {}) {
  const cookiesFile = opts.cookiesFile;
  const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

  // 1. Flat list of the playlist (fast — no per-video extraction).
  const flatJson = await runCapture(
    "yt-dlp",
    ["--flat-playlist", "-J", "--no-warnings", ...cookieArgs(cookiesFile), playlistUrl],
    deps
  );
  const playlist = JSON.parse(flatJson);
  const entries = (playlist.entries ?? []).filter(Boolean);
  if (entries.length === 0) return null;

  // 2. Fetch full metadata only for the candidate ids at each end.
  const ids = candidateIds(entries);
  const metas = [];
  for (const id of ids) {
    const json = await runCapture(
      "yt-dlp",
      [
        "--no-playlist",
        "--dump-json",
        "--no-warnings",
        // Metadata only — don't fail if a candidate's formats aren't resolvable.
        "--ignore-no-formats-error",
        ...cookieArgs(cookiesFile),
        `https://www.youtube.com/watch?v=${id}`,
      ],
      deps
    );
    metas.push(JSON.parse(json));
  }

  // 3. Newest by upload time.
  metas.sort((a, b) => entryTime(b) - entryTime(a));
  const newest = metas[0];
  return {
    id: newest.id,
    title: newest.title ?? "",
    description: newest.description ?? "",
  };
}
