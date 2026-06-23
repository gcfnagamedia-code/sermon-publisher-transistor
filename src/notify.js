// Reports what happened after each run: which video, the cut point, whether it
// auto-published or was left as a draft for review, and any problems.
//
// Alerts always print to the run log. Email sending is OPT-IN: it only happens
// when EMAIL_ENABLED=true and SMTP creds are present (currently off).

import nodemailer from "nodemailer";
import { config } from "./config.js";

function makeTransport() {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: { user: config.email.user, pass: config.email.pass },
  });
}

/** Render a plain-text body from a result summary object. */
export function renderBody(summary) {
  const lines = [
    `Status: ${summary.status}`,
    summary.videoId ? `Video: https://www.youtube.com/watch?v=${summary.videoId}` : null,
    summary.title ? `Title: ${summary.title}` : null,
    summary.cutSeconds != null ? `Cut at: ${formatTime(summary.cutSeconds)}` : null,
    summary.confidence != null ? `LLM confidence: ${summary.confidence}` : null,
    summary.published != null
      ? `Transistor: ${summary.published ? "PUBLISHED (live on Spotify)" : "DRAFT — needs your review"}`
      : null,
    summary.episodeId ? `Episode id: ${summary.episodeId}` : null,
    summary.archive ? `Archived to: ${summary.archive}` : null,
    summary.reason ? `Note: ${summary.reason}` : null,
    summary.error ? `Error: ${summary.error}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatTime(s) {
  const sec = Math.floor(s % 60);
  const min = Math.floor((s / 60) % 60);
  const hr = Math.floor(s / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return hr > 0 ? `${hr}:${pad(min)}:${pad(sec)}` : `${min}:${pad(sec)}`;
}

/**
 * Emit the alert. Always logs to the console; additionally sends email when
 * EMAIL_ENABLED=true and SMTP creds are configured. Swallows email errors so
 * alerting can never crash the run.
 */
export async function sendAlert(summary, deps = {}) {
  const subject =
    `[Sermon Publisher] ${summary.status}` +
    (summary.title ? ` — ${summary.title}` : "");

  // Always surface the alert in the run log (visible in GitHub Actions output).
  console.log(`\n${subject}\n${renderBody(summary)}\n`);

  // Email is opt-in and currently disabled.
  if (!config.email.enabled || !config.email.user || !config.email.pass) return;

  const transport = deps.transport ?? makeTransport();
  try {
    await transport.sendMail({
      from: config.email.from,
      to: config.email.to,
      subject,
      text: renderBody(summary),
    });
  } catch (err) {
    console.error("Failed to send alert email:", err.message);
  }
}
