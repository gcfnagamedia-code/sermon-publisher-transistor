# Operations & Handover — What We Did and What to Look Out For

This is the maintenance guide. If you're brand new and just want to understand *what this is*, read
[HOW-IT-WORKS.md](HOW-IT-WORKS.md) first. For step-by-step credential setup, see the
[README](../README.md).

---

## What was built

An automated weekly pipeline that turns the newest YouTube sermon into a podcast episode on
Transistor (which syndicates to Spotify), cutting the audio so it begins at the scripture reading.
It runs on GitHub Actions — no personal computer or server required.

Key design decisions (so you know *why* it's built this way):

- **Audio-only.** It never downloads the full video — only the audio, which is faster/cheaper. The
  MP3 is the only artifact produced.
- **Cue-phrase cut + AI check.** It finds the cut point by fuzzy-matching a spoken cue phrase in the
  transcript, then an LLM (OpenAI) verifies it before publishing.
- **Auto-publish at confidence ≥ 0.7.** Confident cuts publish live; unsure ones become drafts.
- **Email alerts are OFF.** They print to the run log instead (the Gmail app password wasn't
  working). Easy to re-enable later.
- **Backup on Cloudflare R2.** We originally tried Google Drive but abandoned it — a Google "service
  account" has no Drive storage quota on a personal Gmail, so uploads fail. R2 (S3-compatible) works.

## Where everything lives

| Thing | Location |
|---|---|
| Code repository | GitHub: **`gcfnagamedia-code/sermon-publisher-transistor`** (public) |
| The scheduler | GitHub **Actions** tab → workflow "Publish weekly sermon" |
| Schedule | Every **Sunday 02:05 UTC** = **10:05 AM Manila** (and a manual "Run workflow" button) |
| Podcast host | Transistor, show id **7517** ("GCF NAGA English Sermons") |
| Audio backups | Cloudflare R2 bucket **`sermon-publisher`** |
| Secrets (API keys for the cloud) | GitHub repo → Settings → Secrets and variables → Actions |
| Local secrets (for testing on a PC) | `.env` file in the project (gitignored — never committed) |
| What's been published already | `processed.json` in the repo (prevents duplicates) |

## Account inventory — the logins you need

The system depends on these external accounts. **The passwords and API keys are NOT stored in this
repo.** Whoever hands this over must pass along the account logins (ideally via a password manager).
The GitHub Actions Secrets contain working copies of the API keys, but they're **write-only** — you
can't read them back out of GitHub, so keep the originals safe.

| Account | What it's for | Notes |
|---|---|---|
| **GitHub** `gcfnagamedia-code` | Hosts the code and runs the weekly robot | Owns the repo + secrets |
| **Throwaway Google/YouTube account** | Supplies YouTube login cookies | Used so YouTube allows downloads from the cloud; a spare account on purpose |
| **OpenAI** | The AI that verifies the cut point | One API key; costs a fraction of a cent per run |
| **Transistor** | Podcast host that feeds Spotify | API token + show id 7517 |
| **Cloudflare** | R2 storage for MP3 backups | Account id + R2 API token + bucket name |

## Inheriting this from scratch (zero prior setup)

This section assumes you have **nothing** set up — no tools, no code, no `.env`. Follow it top to
bottom. (Commands shown are for Windows, which is what this was built on.)

### 1. Install the toolchain
You need: **Node.js**, **yt-dlp**, **ffmpeg**, and the **GitHub CLI**.
```
# Node.js 20 or newer: download and install from https://nodejs.org

# yt-dlp (needs Python installed first, from https://python.org):
python -m pip install yt-dlp

# ffmpeg and the GitHub CLI:
winget install --id Gyan.FFmpeg -e
winget install --id GitHub.cli -e
```
**Heads-up:** on Windows these don't always land on your PATH right away. Close and reopen your
terminal after installing, or call them by full path. For reference, on the original machine they
were at:
- yt-dlp: `C:\Users\<you>\AppData\Local\Programs\Python\Python3xx\Scripts\yt-dlp.exe`
- ffmpeg: `C:\Users\<you>\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.../bin/ffmpeg.exe`
- gh: `C:\Program Files\GitHub CLI\gh.exe`

(**Deno** is also needed, but *only* in the cloud — the GitHub workflow installs it automatically.
You don't need Deno on your PC.)

### 2. Get the code
```
gh auth login                       # log into the GitHub account that owns the repo
gh repo clone gcfnagamedia-code/sermon-publisher-transistor
cd sermon-publisher-transistor
npm install
```

### 3. Recreate the `.env` file
```
cp .env.example .env
```
Then open `.env` and fill in every value. **How to obtain each credential is documented step-by-step
in the [README](../README.md)** (playlist id, OpenAI key, Transistor key + show id, R2 keys +
bucket, etc.). If you've lost access to an original account, the README also covers creating a fresh
one — just remember to update the matching GitHub secret afterward (see step 5).

### 4. Test locally (no risk of publishing)
```
npm test                            # should report 29 passing
npm run dry-run                     # finds the cut point, downloads/uploads NOTHING
CONFIDENCE_THRESHOLD=2 npm start    # full run but forced to DRAFT (won't go live)
```

### 5. Redeploy / refresh the cloud secrets
Push code changes with `git push`. To (re)load the secrets into GitHub from your `.env`:
```
# upload all secrets except blank lines / comments:
grep -vE '^[[:space:]]*#|^[[:space:]]*$|^YT_COOKIES_FILE=' .env > secrets.env
gh secret set --env-file secrets.env
rm secrets.env
```
The YouTube cookies secret is set separately from a cookies file (see below). Finally, go to the
repo's **Actions** tab → "Publish weekly sermon" → **Run workflow** to confirm a green run.

## ⚠️ Things to look out for

### 1. YouTube cookies expire — the #1 future failure
YouTube blocks downloads from cloud/datacenter IPs unless we supply login cookies. Those cookies go
stale every few weeks/months. **Symptom:** a Sunday run fails with
*"Sign in to confirm you're not a bot."* **Fix — re-export cookies:**
1. Install the browser extension **"Get cookies.txt LOCALLY"**.
2. Open an **Incognito** window, go to **youtube.com**, and **sign into the throwaway Google
   account** (confirm you see its avatar — you must be logged in).
3. Click the extension → **Export** → it downloads a `cookies.txt`. Close incognito without browsing
   more.
4. Load it into the secret:
   ```
   gh secret set YT_COOKIES < "path\to\cookies.txt"
   ```
5. Re-run the workflow from the Actions tab to confirm it's green.
A valid export has ~20+ cookies including `LOGIN_INFO` and `__Secure-1PSID/3PSID`. If it's tiny
(~7 cookies, no `LOGIN_INFO`), you weren't actually signed in — redo it.

### 2. Datacenter extraction needs Deno — don't remove it
The workflow installs Deno (`denoland/setup-deno@v2`) so yt-dlp can resolve YouTube formats from the
cloud. **Without it you'll see "Requested format is not available."** Leave that step in.

### 3. Auto-publish is LIVE
At confidence ≥ 0.7 (the `CONFIDENCE_THRESHOLD` setting), episodes publish straight to Spotify with
no human check. To make it **draft-only** (review before going live), set `CONFIDENCE_THRESHOLD=2`
in both `.env` and the GitHub secret. It's wise to **listen to the first real auto-published
episode** to confirm the cut is right before fully trusting it.

### 4. The cut depends on the cue phrase
Detection looks for the spoken phrase in `CUE_PHRASE`
("In preparation for today's message, we shall be reading from the book of…"). If the reader changes
the wording a lot, detection may miss and the episode becomes a draft. You can adjust `CUE_PHRASE` or
loosen `CUE_MATCH_THRESHOLD`. Note: some videos already start at the reading — those correctly cut at
~0–2 seconds, which is fine.

### 5. Don't casually edit `processed.json`
It records which videos are already done so the same sermon isn't published twice. The workflow
commits it back automatically after each run. Don't delete entries unless you intend a video to be
reprocessed (and republished).

### 6. Re-enabling email alerts
Currently off. To turn on: set the `EMAIL_ENABLED` secret to `true` and provide a working Gmail
**app password** in `SMTP_PASS` (the account needs 2-Step Verification on). Until then, alerts appear
only in the run logs.

### 7. Costs and limits (all currently free)
- **GitHub Actions:** a weekly run uses ~10 minutes; the free allowance is thousands of minutes/month.
- **Cloudflare R2:** 10 GB free — plenty.
- **OpenAI:** a fraction of a cent per run.
- **Transistor API rate-limits** aggressively (~10 requests / 10 seconds) — if you script against it,
  add delays or you'll get HTTP 429.

### 8. Secrets hygiene
Never commit `.env` or any `cookies.txt` (they're gitignored). After loading cookies into the
`YT_COOKIES` secret, **delete the downloaded `cookies.txt` files** from your computer — they contain
a live login.

## Routine check (each Sunday)
1. Open the repo's **Actions** tab — is the latest run **green**?
2. Check the new episode appeared on **Transistor/Spotify**.
3. Spot-check that the audio **starts at the scripture reading** (especially after any change).

## Common failures → fixes

| Symptom in the logs | Cause | Fix |
|---|---|---|
| "Sign in to confirm you're not a bot" | YouTube cookies expired | Re-export cookies, `gh secret set YT_COOKIES` (see §1) |
| "Requested format is not available" | Deno/extraction issue | Ensure the Install Deno step is present (§2) |
| "Configuration incomplete: X is not set" | A GitHub secret is missing | Add the named secret in repo Settings |
| Transistor "400 Invalid parameters" | Wrong field or show id | Verify `TRANSISTOR_SHOW_ID` (7517) and API key |
| Run is green but nothing published | Newest video already in `processed.json` | Normal — there was no new sermon |

## Outstanding TODOs
- Delete the test **"Law and Conscience | Romans 2:12-16"** draft episodes on Transistor (left over
  from setup testing).
- Delete the `cookies.txt` files from the Downloads folder on the setup machine (live login).
