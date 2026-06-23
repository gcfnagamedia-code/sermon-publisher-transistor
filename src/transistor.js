// Transistor API client. Flow: authorize upload -> PUT the mp3 to the presigned
// URL -> create the episode with YouTube title/description -> publish (or leave
// as a draft). Transistor hosts the audio and syndicates to Spotify.
//
// Docs: https://developers.transistor.fm/

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { config } from "./config.js";

function headers() {
  return {
    "x-api-key": config.transistor.apiKey,
    accept: "application/json",
  };
}

async function asJson(res, label) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transistor ${label} failed: ${res.status} ${body}`);
  }
  return res.json();
}

/** Step 1: get a presigned upload URL + the eventual audio URL. */
export async function authorizeUpload(filename, deps = {}) {
  const f = deps.fetch ?? fetch;
  const url = `${config.transistor.apiBase}/episodes/authorize_upload?filename=${encodeURIComponent(filename)}`;
  const res = await f(url, { headers: headers() });
  const data = await asJson(res, "authorize_upload");
  return {
    uploadUrl: data.data.attributes.upload_url,
    audioUrl: data.data.attributes.audio_url,
  };
}

/** Step 2: PUT the mp3 bytes to the presigned URL. */
export async function uploadAudio(uploadUrl, mp3Path, deps = {}) {
  const f = deps.fetch ?? fetch;
  const body = await readFile(mp3Path);
  const res = await f(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/mpeg" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Transistor audio PUT failed: ${res.status} ${text}`);
  }
}

/**
 * Step 3: create the episode (always created as a draft by Transistor — `status`
 * is NOT a valid create parameter; publishing is the separate step below).
 * Returns the created episode id.
 */
export async function createEpisode(
  { title, summary, description, audioUrl },
  deps = {}
) {
  const f = deps.fetch ?? fetch;
  const form = new URLSearchParams();
  form.set("episode[show_id]", config.transistor.showId);
  form.set("episode[title]", title);
  if (summary) form.set("episode[summary]", summary);
  if (description) form.set("episode[description]", description);
  form.set("episode[audio_url]", audioUrl);

  const res = await f(`${config.transistor.apiBase}/episodes`, {
    method: "POST",
    headers: { ...headers(), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await asJson(res, "create episode");
  return data.data.id;
}

/** Step 4 (conditional): publish a draft episode so it goes live / syndicates. */
export async function publishEpisode(episodeId, deps = {}) {
  const f = deps.fetch ?? fetch;
  const form = new URLSearchParams();
  form.set("episode[status]", "published");
  const res = await f(`${config.transistor.apiBase}/episodes/${episodeId}/publish`, {
    method: "PATCH",
    headers: { ...headers(), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  await asJson(res, "publish episode");
}

/**
 * High-level: upload the mp3 and create the episode, publishing only if `publish`
 * is true. Returns { episodeId, published }.
 */
export async function uploadEpisode(
  { mp3Path, title, summary, description, publish },
  deps = {}
) {
  const filename = basename(mp3Path);
  const { uploadUrl, audioUrl } = await authorizeUpload(filename, deps);
  await uploadAudio(uploadUrl, mp3Path, deps);
  const episodeId = await createEpisode(
    { title, summary, description, audioUrl },
    deps
  );
  if (publish) await publishEpisode(episodeId, deps);
  return { episodeId, published: Boolean(publish) };
}
