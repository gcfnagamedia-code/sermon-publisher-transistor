import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBody } from "../src/notify.js";

test("renderBody: formats a published summary with HH:MM:SS cut", () => {
  const body = renderBody({
    status: "PUBLISHED",
    videoId: "abc123",
    title: "Walking by Faith",
    cutSeconds: 3725, // 1:02:05
    confidence: 0.93,
    published: true,
    episodeId: "999",
    archive: "sermons/abc123.mp3",
  });
  assert.match(body, /Status: PUBLISHED/);
  assert.match(body, /Cut at: 1:02:05/);
  assert.match(body, /PUBLISHED \(live on Spotify\)/);
  assert.match(body, /youtube\.com\/watch\?v=abc123/);
  assert.match(body, /Archived to: sermons\/abc123\.mp3/);
});

test("renderBody: omits absent fields and marks drafts", () => {
  const body = renderBody({ status: "DRAFT_FOR_REVIEW", published: false });
  assert.match(body, /DRAFT — needs your review/);
  assert.doesNotMatch(body, /Episode id/);
});
