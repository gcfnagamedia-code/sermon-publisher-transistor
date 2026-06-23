// Central configuration. Reads from environment (CI secrets or a local .env loaded
// by the orchestrator). Non-secret tunables have sensible defaults so the app runs
// with the minimum set of secrets configured.

function env(name, fallback = undefined) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function requireEnv(name) {
  const v = env(name);
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  youtube: {
    playlistId: env("YOUTUBE_PLAYLIST_ID"),
    cookiesFile: env("YT_COOKIES_FILE"), // optional
  },
  cue: {
    phrase: env(
      "CUE_PHRASE",
      "In preparation for today's message, we shall be reading from the book of"
    ),
    // Minimum similarity (0–1) for the fuzzy match to be considered a hit.
    matchThreshold: Number(env("CUE_MATCH_THRESHOLD", "0.6")),
    // Seconds of transcript context to send to the verifier on each side of the hit.
    windowSeconds: Number(env("CUE_WINDOW_SECONDS", "40")),
  },
  llm: {
    apiKey: env("OPENAI_API_KEY"),
    model: env("LLM_MODEL", "gpt-5.4-mini"),
    // Below this confidence we create a draft instead of auto-publishing.
    confidenceThreshold: Number(env("CONFIDENCE_THRESHOLD", "0.7")),
  },
  transistor: {
    apiKey: env("TRANSISTOR_API_KEY"),
    showId: env("TRANSISTOR_SHOW_ID"),
    apiBase: "https://api.transistor.fm/v1",
  },
  r2: {
    // Cloudflare R2 (S3-compatible) for the mp3 archive.
    accountId: env("R2_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET"),
  },
  email: {
    // Off by default — alerts print to the run log. Set EMAIL_ENABLED=true (plus
    // SMTP creds) to also send email.
    enabled: env("EMAIL_ENABLED") === "true",
    host: env("SMTP_HOST", "smtp.gmail.com"),
    port: Number(env("SMTP_PORT", "465")),
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
    from: env("ALERT_FROM", env("SMTP_USER")),
    to: env("ALERT_TO", "eleonpilapil@gmail.com"),
  },
  stateFile: env("STATE_FILE", "processed.json"),
};

// Validates that everything needed for a *real* (non-dry-run) publish is present.
// Returns an array of human-readable problems; empty array means good to go.
export function validateForPublish() {
  const problems = [];
  if (!config.youtube.playlistId) problems.push("YOUTUBE_PLAYLIST_ID is not set");
  if (!config.llm.apiKey) problems.push("OPENAI_API_KEY is not set");
  if (!config.transistor.apiKey) problems.push("TRANSISTOR_API_KEY is not set");
  if (!config.transistor.showId) problems.push("TRANSISTOR_SHOW_ID is not set");
  if (!config.r2.accountId) problems.push("R2_ACCOUNT_ID is not set");
  if (!config.r2.accessKeyId) problems.push("R2_ACCESS_KEY_ID is not set");
  if (!config.r2.secretAccessKey) problems.push("R2_SECRET_ACCESS_KEY is not set");
  if (!config.r2.bucket) problems.push("R2_BUCKET is not set");
  return problems;
}

export { requireEnv };
