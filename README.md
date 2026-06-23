# Sermon → Spotify Auto-Publisher

Every week this turns the newest sermon in a YouTube playlist into a podcast episode on
**Transistor** (which syndicates to Spotify), cutting the audio so it starts at the **scripture
reading** and runs to the end. It finds the cut point from the video's transcript, double-checks it
with a cheap LLM, and logs a summary of each run. The final mp3 is archived to Cloudflare R2.

It runs on **GitHub Actions** (free for this volume) — no PC or server needed.

## Documentation

- **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)** — plain-English explainer. **Start here if you're
  new** or non-technical.
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — maintenance, things to watch out for, and a full
  "inherit this from scratch" runbook.
- The rest of this README is the credential/setup reference.

## How it works

```
Sunday 02:05 UTC (10:05 AM Manila)
 1. Find newest playlist video          (yt-dlp — no YouTube API key)
 2. Skip if already processed           (processed.json)
 3. Fetch transcript                     (youtube-transcript, en → default)
 4. Find the cue phrase                  (fuzzy match → start timestamp)
 5. Verify the cut with OpenAI           (confident → publish, unsure → draft)
 6. Download audio-only + trim to mp3     (yt-dlp + ffmpeg)
 7. Upload to Transistor                  (title + description from YouTube)
 8. Archive mp3 to Cloudflare R2
 9. Email you a summary
```

The **cut point** is the spoken cue phrase, e.g. *"In preparation for today's message, we shall be
reading from the book of…"*. Matching is fuzzy, so small wording/caption differences are fine.

**Safety:** if the LLM is confident the cut is right, the episode auto-publishes. If it's unsure (or
the cue/transcript is missing), the episode is left as a **draft** for you to review — it never goes
live on a bad cut.

## One-time setup

### 1. Put this in a GitHub repo
Create a repo and push these files. A **private** repo is fine (2,000 free Actions minutes/month;
a run uses ~10).

### 2. Transistor
- Get your API key: Transistor → Account → **Your API token**.
- Get your show id: `curl -s https://api.transistor.fm/v1/shows -H "x-api-key: YOUR_KEY"` and copy
  the `id` of your show.

### 3. OpenAI
- Create an API key at platform.openai.com. The verification step costs a fraction of a cent per run.

### 4. Cloudflare R2 (archive)
- Sign in at **dash.cloudflare.com** → **R2** → **Create bucket** (e.g. `sermon-archive`).
- Your **Account ID** is shown on the R2 overview page (`R2_ACCOUNT_ID`).
- **R2 → Manage R2 API Tokens → Create API Token** with **Object Read & Write** for that bucket.
  Copy the **Access Key ID** (`R2_ACCESS_KEY_ID`) and **Secret Access Key** (`R2_SECRET_ACCESS_KEY`).
- `R2_BUCKET` is the bucket name.

### 5. Email alerts (optional — OFF by default)
Alerts always print to the run log (visible in GitHub Actions output), so email is optional. To
also receive email:
- Set `EMAIL_ENABLED=true`.
- Turn on 2-step verification, then create a Gmail **App Password**.
- Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app
  password>`.

Leave `EMAIL_ENABLED=false` (the default) to skip email entirely.

### 6. Add GitHub repo secrets
Repo → Settings → Secrets and variables → Actions → **New repository secret**, for each:

| Secret | Value |
|---|---|
| `YOUTUBE_PLAYLIST_ID` | Playlist id (the `list=` part of the playlist URL) |
| `CUE_PHRASE` | The spoken cue phrase to cut on |
| `CONFIDENCE_THRESHOLD` | e.g. `0.7` |
| `OPENAI_API_KEY` | OpenAI key |
| `LLM_MODEL` | e.g. `gpt-5.4-mini` |
| `TRANSISTOR_API_KEY` | Transistor token |
| `TRANSISTOR_SHOW_ID` | Transistor show id |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 API token access key id |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | R2 bucket name |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email/SMTP creds |
| `ALERT_FROM`, `ALERT_TO` | From / to email addresses |
| `YT_COOKIES` | *(optional)* Netscape-format cookies, only if YouTube throttles the runner |

### 7. Done
The job runs automatically **Sunday 10:05 AM Manila time**. To test it now, go to the **Actions** tab
→ *Publish weekly sermon* → **Run workflow**.

## Running locally

```bash
npm install
cp .env.example .env      # fill in your values
npm run dry-run           # finds the video, transcript & cut point — NO download/upload
npm start                 # full run (downloads, uploads, publishes/drafts)
npm test                  # unit tests
```

`npm run dry-run` is the safe way to confirm the cue is being detected at the right timestamp before
letting it publish anything. You'll need `yt-dlp` and `ffmpeg` on your PATH for a full local run.

## Tuning

All in `src/config.js` (overridable via env):

- `CUE_PHRASE` — the phrase to cut on.
- `CUE_MATCH_THRESHOLD` (default `0.6`) — how close the transcript must match the cue.
- `CONFIDENCE_THRESHOLD` (default `0.7`) — LLM confidence required to auto-publish.
- `CUE_WINDOW_SECONDS` (default `40`) — transcript context sent to the LLM around the cut.
- `LLM_MODEL` — the OpenAI model id.

## Notes

- **Audio-only:** the full video is never downloaded — only the audio, which is trimmed and encoded
  to mp3. The mp3 is the only artifact kept.
- **State:** `processed.json` records published video ids and is committed back by the workflow so
  the same sermon is never published twice.
- **No new sermon?** The run exits quietly. A failed download/upload fails loudly (GitHub emails you)
  and does **not** record the video, so the next run retries it.
