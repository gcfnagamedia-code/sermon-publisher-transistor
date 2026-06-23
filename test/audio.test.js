import { test } from "node:test";
import assert from "node:assert/strict";
import { buildYtDlpArgs, buildFfmpegArgs } from "../src/audio.js";

test("buildYtDlpArgs: audio-only, no playlist, with output", () => {
  const args = buildYtDlpArgs("https://youtu.be/x", "/tmp/a.%(ext)s");
  assert.deepEqual(args.slice(0, 3), ["-f", "bestaudio/best", "--no-playlist"]);
  assert.equal(args[args.indexOf("-o") + 1], "/tmp/a.%(ext)s");
  assert.equal(args[args.length - 1], "https://youtu.be/x");
});

test("buildYtDlpArgs: includes cookies when provided", () => {
  const args = buildYtDlpArgs("URL", "OUT", { cookiesFile: "/c.txt" });
  assert.ok(args.includes("--cookies"));
  assert.equal(args[args.indexOf("--cookies") + 1], "/c.txt");
});

test("buildFfmpegArgs: seeks to start, drops video, encodes mp3", () => {
  const args = buildFfmpegArgs("/in.m4a", 123.4, "/out.mp3");
  assert.equal(args[args.indexOf("-ss") + 1], "123.4");
  assert.equal(args[args.indexOf("-i") + 1], "/in.m4a");
  assert.ok(args.includes("-vn"));
  assert.equal(args[args.length - 1], "/out.mp3");
});

test("buildFfmpegArgs: clamps negative start to 0", () => {
  const args = buildFfmpegArgs("/in.m4a", -5, "/out.mp3");
  assert.equal(args[args.indexOf("-ss") + 1], "0");
});
