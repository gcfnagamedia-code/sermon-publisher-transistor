// Orchestrator for the weekly sermon -> Spotify pipeline.
//
// Branches:
//   - no new video / already processed -> exit quietly
//   - no transcript / no cue match      -> alert + mark processed (don't retry forever)
//   - cue found, LLM not confident       -> upload as DRAFT + alert (don't publish)
//   - cue found, LLM confident           -> trim, upload, PUBLISH + alert
//   - hard failure (download/upload/etc.) -> alert + fail loudly, do NOT mark processed

import "./loadenv.js";
import { config, validateForPublish } from "./config.js";
import { getNewestVideo } from "./playlist.js";
import { fetchTranscript } from "./transcript.js";
import { findCuePoint, extractWindow } from "./cuepoint.js";
import { verifyCutPoint } from "./verify.js";
import { downloadAndTrim, cleanup } from "./audio.js";
import { uploadEpisode } from "./transistor.js";
import { archiveMp3 } from "./storage.js";
import { isProcessed, markProcessed } from "./state.js";
import { sendAlert } from "./notify.js";

function truncate(text, n) {
  if (!text) return "";
  return text.length <= n ? text : text.slice(0, n - 1).trimEnd() + "…";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Sermon publisher starting${dryRun ? " (DRY RUN)" : ""}…`);

  if (!dryRun) {
    const problems = validateForPublish();
    if (problems.length) {
      throw new Error("Configuration incomplete:\n  - " + problems.join("\n  - "));
    }
  }

  // 1. Newest playlist video
  const video = await getNewestVideo(config.youtube.playlistId, {
    cookiesFile: config.youtube.cookiesFile,
  });
  if (!video) {
    console.log("No videos found in playlist. Nothing to do.");
    return;
  }
  console.log(`Newest video: ${video.id} — ${video.title}`);

  // 2. Dedup
  if (await isProcessed(video.id)) {
    console.log("Already processed. Exiting quietly.");
    return;
  }

  // 3. Transcript
  const transcript = await fetchTranscript(video.id);

  // 4. Cue point
  const candidate = transcript
    ? findCuePoint(transcript, config.cue.phrase, { minScore: config.cue.matchThreshold })
    : null;

  if (!candidate) {
    const reason = transcript
      ? "Cue phrase not found in transcript."
      : "No transcript available.";
    console.warn(`Cannot determine cut point: ${reason}`);
    if (!dryRun) await markProcessed(video.id);
    await sendAlert({
      status: "NO_CUT_FOUND",
      videoId: video.id,
      title: video.title,
      reason: reason + " Needs manual handling.",
    });
    return;
  }
  console.log(
    `Cue matched at ${candidate.start.toFixed(1)}s (score ${candidate.score.toFixed(2)})`
  );

  // 5. LLM verification (publish gate)
  const windowText = extractWindow(transcript, candidate.start, config.cue.windowSeconds);
  const verification = await verifyCutPoint({
    windowText,
    candidateStart: candidate.start,
  });
  const publish = verification.confident;
  console.log(
    `LLM confidence ${verification.confidence} -> ${publish ? "PUBLISH" : "DRAFT"} (${verification.reason})`
  );

  if (dryRun) {
    console.log("DRY RUN — stopping before download/upload. Computed result:");
    console.log({
      videoId: video.id,
      title: video.title,
      cutSeconds: candidate.start,
      confidence: verification.confidence,
      wouldPublish: publish,
      description: truncate(video.description, 120),
    });
    return;
  }

  // 6–8. Produce audio + upload to Transistor. A failure HERE is fatal and must NOT
  // mark the video processed, so it retries (without creating a duplicate episode).
  let workDir;
  try {
    const audio = await downloadAndTrim({
      videoId: video.id,
      startSeconds: candidate.start,
      cookiesFile: config.youtube.cookiesFile,
    });
    workDir = audio.workDir;

    const episode = await uploadEpisode({
      mp3Path: audio.mp3Path,
      title: video.title,
      summary: truncate(video.description, 250),
      description: video.description,
      publish,
    });

    // Archive is best-effort: the episode is already on Transistor, so an archive
    // failure must not fail the run (that would re-create the episode next time).
    let archive = null;
    let archiveError = null;
    try {
      const r = await archiveMp3(audio.mp3Path);
      archive = `${r.bucket}/${r.key}`;
    } catch (e) {
      archiveError = e.message;
      console.error("Archive to R2 failed (non-fatal):", e.message);
    }

    await markProcessed(video.id);

    await sendAlert({
      status: publish ? "PUBLISHED" : "DRAFT_FOR_REVIEW",
      videoId: video.id,
      title: video.title,
      cutSeconds: candidate.start,
      confidence: verification.confidence,
      published: episode.published,
      episodeId: episode.episodeId,
      archive,
      reason:
        verification.reason + (archiveError ? ` | ARCHIVE FAILED: ${archiveError}` : ""),
    });
    console.log(
      `Done. Episode ${episode.episodeId} (${publish ? "published" : "draft"})` +
        (archive ? `, archived to ${archive}.` : `, archive skipped/failed.`)
    );
  } catch (err) {
    await sendAlert({
      status: "FAILED",
      videoId: video.id,
      title: video.title,
      cutSeconds: candidate.start,
      error: err.message,
    });
    throw err; // fail the CI job loudly; processed.json stays unchanged for retry
  } finally {
    await cleanup(workDir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
