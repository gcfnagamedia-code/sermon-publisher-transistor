// Downloads audio-only from YouTube (yt-dlp) and trims it from the cut point to the
// end, encoding to mp3 (ffmpeg). Never downloads the full video.
//
// Command builders are pure functions so the trim logic is unit-testable without
// spawning real processes.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Build yt-dlp args to fetch best audio into outPath. */
export function buildYtDlpArgs(videoUrl, outPath, { cookiesFile } = {}) {
  const args = [
    "-f",
    "bestaudio",
    "--no-playlist",
    "--no-progress",
    "--no-warnings",
    "-o",
    outPath,
  ];
  if (cookiesFile) args.push("--cookies", cookiesFile);
  args.push(videoUrl);
  return args;
}

/**
 * Build ffmpeg args to trim from startSeconds to end and encode mp3.
 * -ss before -i seeks quickly; -vn drops any video; libmp3lame q:a 2 ~190kbps VBR.
 */
export function buildFfmpegArgs(inPath, startSeconds, outPath) {
  const start = Math.max(0, Number(startSeconds) || 0);
  return [
    "-y",
    "-loglevel",
    "error",
    "-nostats",
    "-ss",
    String(start),
    "-i",
    inPath,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-q:a",
    "2",
    outPath,
  ];
}

function run(cmd, args, deps = {}) {
  const spawnFn = deps.spawn ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnFn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

/**
 * Download audio-only and trim to mp3.
 * @returns {Promise<string>} path to the produced mp3 (caller owns cleanup of dir)
 */
export async function downloadAndTrim(
  { videoId, startSeconds, cookiesFile },
  deps = {}
) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const workDir = await mkdtemp(join(tmpdir(), "sermon-"));
  const rawPath = join(workDir, "audio.%(ext)s");
  const rawResolved = join(workDir, "audio.m4a"); // yt-dlp fills ext; we re-glob below
  const mp3Path = join(workDir, `${videoId}.mp3`);

  await run("yt-dlp", buildYtDlpArgs(videoUrl, rawPath, { cookiesFile }), deps);

  // yt-dlp wrote audio.<ext>; find it regardless of container.
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(workDir);
  const audioFile = files.find((f) => f.startsWith("audio."));
  const inPath = audioFile ? join(workDir, audioFile) : rawResolved;

  await run("ffmpeg", buildFfmpegArgs(inPath, startSeconds, mp3Path), deps);

  return { mp3Path, workDir };
}

/** Remove a work directory created by downloadAndTrim. */
export async function cleanup(workDir) {
  if (workDir) await rm(workDir, { recursive: true, force: true });
}
