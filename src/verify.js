// Uses a cheap OpenAI model to verify that a scripture reading actually begins at
// the candidate cut point. Acts as the safety gate: high confidence -> auto-publish,
// low confidence -> draft + alert.

import OpenAI from "openai";
import { config } from "./config.js";

const SYSTEM_PROMPT =
  "You verify edit points for a church sermon podcast. You are given a snippet of " +
  "transcript around a candidate cut point. The cut should land right where the " +
  "reader announces and begins a scripture/Bible reading (often introduced by a cue " +
  "like 'in preparation for today's message, we shall be reading from the book of ...'). " +
  "Decide whether a scripture reading clearly begins within this snippet. " +
  "Respond ONLY with JSON: " +
  '{"isReadingStart": boolean, "confidence": number, "reason": string}. ' +
  "confidence is 0.0-1.0.";

/**
 * @param {object} args
 * @param {string} args.windowText - transcript text around the candidate cut point
 * @param {number} args.candidateStart - candidate cut time in seconds
 * @param {string} [args.cuePhrase]
 * @param {object} [deps] - injectable client for testing
 * @returns {Promise<{confident:boolean, confidence:number, startSeconds:number, reason:string}>}
 */
export async function verifyCutPoint(args, deps = {}) {
  const { windowText, candidateStart, cuePhrase = config.cue.phrase } = args;
  const threshold = config.llm.confidenceThreshold;

  const client =
    deps.client ?? new OpenAI({ apiKey: config.llm.apiKey });

  const userPrompt =
    `Cue phrase we expect: "${cuePhrase}"\n\n` +
    `Transcript snippet around the candidate cut point:\n"""\n${windowText}\n"""`;

  let parsed;
  try {
    const resp = await client.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    parsed = JSON.parse(resp.choices[0].message.content);
  } catch (err) {
    // On any LLM/parse failure, fail safe: not confident -> draft path.
    return {
      confident: false,
      confidence: 0,
      startSeconds: candidateStart,
      reason: `verification failed: ${err.message}`,
    };
  }

  const confidence = Number(parsed.confidence) || 0;
  const confident = Boolean(parsed.isReadingStart) && confidence >= threshold;

  return {
    confident,
    confidence,
    startSeconds: candidateStart,
    reason: String(parsed.reason ?? ""),
  };
}
