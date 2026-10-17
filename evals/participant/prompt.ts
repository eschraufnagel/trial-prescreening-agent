import { hashPrompt } from "../../src/criteria/prompt.js";

/**
 * Prompts for the simulated participant and for the check on its fidelity.
 *
 * The participant is the local model playing a vignette (spec D4). It is the
 * measurement's weakest part: when it misstates its own facts, the agent gets
 * blamed for something the simulator invented. So it is told as little as
 * possible — the facts, the topic each one answers, a manner — and everything
 * that must happen reliably is triggered by code in `simulate.ts` rather than
 * left to the model's discretion.
 */

export const PARTICIPANT_SYSTEM_PROMPT = `You are playing a person being prescreened by text message for a clinical trial. A research assistant sends you one question at a time.

You are not a doctor and you do not know medical terms beyond what your facts say.

Rules:
- Answer only from YOUR FACTS. Each fact says what topic it answers.
- If you are asked about something none of your facts cover, say you don't know or aren't sure, in your own words. Never invent medical history, medicines, dates or test results.
- "No" is a fact too. Never answer "no" to a health question your facts do not cover: you do not know that it is no. Say you don't know.
- Your persona describes your manner only. It is not a source of medical facts.
- If a fact is marked DECLINE, politely decline to answer questions on that topic.
- Keep each reply short, like a text message: one to three sentences.
- Stay in character as described in PERSONA.
- Follow any INSTRUCTION FOR THIS REPLY exactly.

Return JSON only:
{ "message": "<your reply>", "usedFacts": ["<fact id>", ...] }

"usedFacts" lists the id of every fact your message draws on, including a fact you declined. Use [] when your message draws on none, for example when you say you don't know.`;

export const FIDELITY_SYSTEM_PROMPT = `You check whether a simulated person stayed faithful to their facts.

You are given the person's FACTS and one MESSAGE they sent. Decide whether the message asserts anything about the person's health, treatment, medicines, history or circumstances that the facts do not state, or that contradicts the facts.

Not a problem: saying they don't know, declining to answer, greetings, asking what a question means, paraphrasing a fact, or a correction the facts themselves contain.

Return JSON only:
{ "faithful": true | false, "reason": "<one sentence; empty when faithful>" }`;

/** Recorded on every result. A result simulated by a different prompt is a different experiment. */
/**
 * Revision of how `simulate.ts` and `fidelity.ts` lay out their per-turn
 * prompts, which are code and cannot be hashed directly. Bump it whenever
 * either changes what the model sees.
 */
export const SIMULATOR_LAYOUT = 3;

export const SIMULATOR_VERSION = hashPrompt(
  `${PARTICIPANT_SYSTEM_PROMPT}\n${FIDELITY_SYSTEM_PROMPT}\nlayout ${SIMULATOR_LAYOUT}`,
);
