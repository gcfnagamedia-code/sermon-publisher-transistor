# How It Works (Plain English)

**New here? Start with this page.** It explains, in everyday language, what this project is and how
it works — no technical background needed. For maintenance and "things to watch out for," see
[OPERATIONS.md](OPERATIONS.md). For exact setup commands, see the [README](../README.md).

---

## What this does

Every week, our church posts the Sunday sermon as a video on YouTube. We also publish it as a
**podcast** (which shows up on Spotify) so people can listen on the go. Doing that by hand is
tedious: download the video, trim off the beginning so it starts at the scripture reading, save just
the audio, and upload it with the right title and description.

**This project does all of that automatically.** Once a week, a free "robot" wakes up, finds the
newest sermon video, figures out where the scripture reading begins, cuts off everything before it,
turns it into an audio file, and publishes it to our podcast — which then appears on Spotify. A
backup copy of the audio is saved too. Nobody has to lift a finger.

## The big picture (the weekly story)

Think of it like a diligent volunteer who follows the same checklist every Sunday:

1. **Sunday morning** — the robot wakes up (10:05 AM Manila time).
2. **Finds the sermon** — it looks at our YouTube playlist and grabs the newest video.
3. **Already done?** — if it already handled that video, it stops (no duplicates).
4. **Reads the captions** — it pulls the video's transcript (the auto-captions).
5. **Finds the starting point** — it searches the transcript for the spoken cue
   *"In preparation for today's message, we shall be reading from the book of…"* — that's where the
   scripture reading begins, and where we want the audio to start.
6. **Double-checks** — it asks an AI assistant, "Does a scripture reading really start here?" to make
   sure it didn't pick the wrong spot.
7. **Trims and converts** — it downloads just the audio, cuts off everything before the reading, and
   saves it as an MP3.
8. **Publishes** — it uploads the MP3 to our podcast host with the video's title and description.
   The podcast host automatically sends it out to Spotify.
9. **Backs it up** — it saves a copy of the MP3 to cloud storage.
10. **Writes a note** — it logs a summary of what it did.

```
Sunday  →  find newest video  →  find where the reading starts  →
trim to audio  →  publish to podcast (→ Spotify)  →  save a backup
```

## The pieces involved (and why each one exists)

This project glues together a few free online services. Here's what each is for, in plain words:

| Piece | What it is | Why we use it |
|---|---|---|
| **YouTube** | Where the sermon videos already live | The source of each week's sermon |
| **The transcript + cue phrase** | The video's auto-captions, searched for a set sentence | How the robot knows *where* to start the cut |
| **OpenAI** | An AI "double-checker" | Confirms the cut point is really the scripture reading, so a bad cut doesn't go out |
| **Transistor** | Our podcast host (show called "GCF NAGA English Sermons") | Stores the audio and automatically feeds it to Spotify, Apple Podcasts, etc. |
| **Cloudflare R2** | Cloud file storage | Keeps a backup copy of every MP3 |
| **GitHub Actions** | A free "robot scheduler" in the cloud | Runs the whole thing every week — no computer of ours needs to be on |

## How it decides to publish vs. hold back

We don't want a badly-cut episode going public. So after the robot finds the cut point, the AI gives
it a **confidence score**:

- **Confident** → it publishes the episode **live** automatically (it appears on Spotify).
- **Not sure** (or it couldn't find the cue) → it saves the episode as a **draft** instead and does
  **not** publish, so a human can check it first.

## Where to look

- **The published episodes:** our Transistor dashboard, and on **Spotify** (the "GCF NAGA English
  Sermons" show).
- **What the robot did each week:** on GitHub, under the project's **"Actions"** tab — each weekly
  run is listed there with a full log. Green = success.
- **The audio backups:** the Cloudflare R2 bucket named `sermon-publisher`.

## What it does NOT do

So expectations are clear:

- It **doesn't edit the sermon content** — it only trims the beginning so the audio starts at the
  reading, and keeps everything from there to the end.
- It **doesn't write titles or descriptions** — those are copied straight from the YouTube video, so
  whatever the video is titled is what the podcast episode is titled.
- It **doesn't touch the video** — only the audio. There's never a trimmed video file; the MP3 is the
  only thing produced.
- It **doesn't fix bad captions** — if a video has no transcript, it can't find the cut and will hold
  the episode as a draft for a human.
