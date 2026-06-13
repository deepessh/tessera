import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GrokSession } from "./grokSession.js";
import {
  PATIENT_CONTEXT,
  advocateInstructions,
  advocateOpening,
  CLINIC_INSTRUCTIONS,
  ADVOCATE_TOOLS,
} from "./scenario.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT, "runs");

export const EXCHANGES = 4;
export const TURN_TIMEOUT_MS = 20000;
export const MAX_TOTAL_MS = 90000;
export const SAMPLE_RATE = 24000;

const ADVOCATE_VOICE = "eve";
const CLINIC_VOICE = "rex";
const ADVOCATE_OUTPUT_SPEED = 1.15;

const noop = () => {};

function pcmToWav(pcm, sampleRate = SAMPLE_RATE) {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

function createRunDir() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(RUNS_DIR, ts);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function saveTurn(runDir, turnIndex, role, result, startMs) {
  if (result.type !== "audio" || !result.pcm) {
    throw new Error(`saveTurn called on non-audio turn (type=${result.type})`);
  }

  const wavName = `turn-${String(turnIndex).padStart(2, "0")}-${role}.wav`;
  const wavPath = path.join(runDir, wavName);
  const wav = pcmToWav(result.pcm);
  fs.writeFileSync(wavPath, wav);

  const durMs = Math.round((result.pcm.length / 2 / SAMPLE_RATE) * 1000);

  return {
    role,
    type: "audio",
    text: result.transcript,
    wavPath: path.relative(ROOT, wavPath),
    startMs,
    durMs,
  };
}

function writeManifest(runDir, turns, elapsedMs, outcome = null) {
  const manifest = {
    createdAt: new Date().toISOString(),
    exchanges: EXCHANGES,
    elapsedMs,
    turns,
    ...(outcome ? { outcome } : {}),
  };
  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(runDir, "transcript.json"),
    JSON.stringify(
      turns.map((t) => {
        const base = { role: t.role, startMs: t.startMs };
        if (t.type === "audio") return { ...base, text: t.text, durMs: t.durMs };
        if (t.role === "tool_call") return { ...base, tool: t.tool, args: t.args };
        if (t.role === "handoff") return { ...base, reason: t.reason, decision: t.decision };
        if (t.role === "outcome") return { ...base, outcome: t.outcome };
        return { ...base, text: t.text };
      }),
      null,
      2
    )
  );
  return manifest;
}

function markGood(runDir, manifest) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RUNS_DIR, "last-good.json"),
    JSON.stringify({ runDir: path.relative(ROOT, runDir), ...manifest }, null, 2)
  );
}

async function invokeHook(hook, ...args) {
  if (!hook) return;
  await hook(...args);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error("Call aborted");
  }
}

async function advocateRespond(advocate, text, turns, runStart, timing, hooks) {
  const { requestDecision, onHandoff, emitTurn } = hooks;
  let audioStartMs = Date.now() - runStart;
  let result = await advocate.sendUserTurn(text);

  while (true) {
    if (result.type === "function_call") {
      const eventStart = Date.now() - runStart;

      if (result.name === "request_patient_input") {
        turns.push({
          role: "tool_call",
          tool: result.name,
          args: result.args,
          startMs: eventStart,
        });

        await invokeHook(onHandoff, {
          reason: result.args.reason,
          options: result.args.options,
        });

        const pauseStart = Date.now();
        const decision = await requestDecision(result.args);
        timing.handoffPauseMs += Date.now() - pauseStart;

        turns.push({
          role: "handoff",
          reason: result.args.reason,
          options: result.args.options,
          decision,
          startMs: Date.now() - runStart,
        });

        audioStartMs = Date.now() - runStart;
        result = await advocate.sendFunctionResult(result.callId, decision);
        if (result.type === "audio") {
          // The advocate speaks its acknowledgement of the patient's choice
          // before completing. Surface that turn to the browser instead of
          // dropping it, otherwise the agent appears to go silent post-handoff.
          await emitTurn("advocate", result, audioStartMs);
          audioStartMs = Date.now() - runStart;
          result = await advocate.sendUserTurn(
            "The patient has decided. Call complete_call immediately with status, summary, next_steps, and reference_number."
          );
        }
        continue;
      }

      if (result.name === "complete_call") {
        turns.push({
          role: "tool_call",
          tool: result.name,
          args: result.args,
          startMs: eventStart,
        });
        return { type: "complete", outcome: result.args };
      }

      throw new Error(`Unknown advocate tool: ${result.name}`);
    }

    if (result.type === "audio") {
      return { ...result, audioStartMs };
    }

    throw new Error(`Unexpected advocate response type: ${result.type}`);
  }
}

/**
 * Run a full advocate<->clinic call loop.
 *
 * @param {object} hooks
 * @param {(turn: object) => void|Promise<void>} [hooks.onTurn] - after each audio turn is saved
 * @param {({reason, options}) => void|Promise<void>} [hooks.onHandoff] - on request_patient_input
 * @param {(outcome: object) => void|Promise<void>} [hooks.onOutcome] - on complete_call
 * @param {({reason: string}) => void|Promise<void>} [hooks.onEnd] - when loop ends without outcome
 * @param {({reason, options}) => Promise<{choice,label,note}>} hooks.requestDecision - resolves patient choice
 * @param {string} [hooks.apiKey] - defaults to process.env.X_AI_API_KEY
 * @param {AbortSignal} [hooks.signal] - aborts the call and closes Grok sessions
 */
export async function runCall({
  onTurn = noop,
  onHandoff = noop,
  onOutcome = noop,
  onEnd = noop,
  requestDecision,
  apiKey = process.env.X_AI_API_KEY,
  signal,
} = {}) {
  if (!apiKey) {
    throw new Error("Missing X_AI_API_KEY in .env");
  }
  if (!requestDecision) {
    throw new Error("runCall requires requestDecision");
  }

  const runDir = createRunDir();
  const runStart = Date.now();
  const turns = [];
  let turnIndex = 0;
  let outcome = null;

  const advocate = new GrokSession({
    apiKey,
    voice: ADVOCATE_VOICE,
    instructions: advocateInstructions(PATIENT_CONTEXT),
    tools: ADVOCATE_TOOLS,
    turnTimeoutMs: TURN_TIMEOUT_MS,
    label: "advocate",
    outputSpeed: ADVOCATE_OUTPUT_SPEED,
  });

  const clinic = new GrokSession({
    apiKey,
    voice: CLINIC_VOICE,
    instructions: CLINIC_INSTRUCTIONS,
    turnTimeoutMs: TURN_TIMEOUT_MS,
    label: "clinic",
  });

  const emitTurn = async (role, audioResult, startMs) => {
    const saved = saveTurn(runDir, turnIndex++, role, audioResult, startMs);
    turns.push(saved);
    await invokeHook(onTurn, saved);
    return saved;
  };

  const hooks = { requestDecision, onHandoff, emitTurn };

  const onAbort = () => {
    advocate.close();
    clinic.close();
  };
  signal?.addEventListener("abort", onAbort);

  try {
    throwIfAborted(signal);
    await Promise.all([advocate.connect(), clinic.connect()]);
    advocate.configure();
    clinic.configure();

    const openingText = advocateOpening(PATIENT_CONTEXT);
    const openingStart = Date.now() - runStart;
    const opening = await advocate.openWith(openingText);
    await emitTurn("advocate", opening, openingStart);

    let lastText = opening.transcript;
    let callComplete = false;
    const timing = { handoffPauseMs: 0 };

    const effectiveElapsed = () => Date.now() - runStart - timing.handoffPauseMs;

    for (let exchange = 1; exchange <= EXCHANGES && !callComplete; exchange++) {
      throwIfAborted(signal);
      if (effectiveElapsed() > MAX_TOTAL_MS) {
        throw new Error(`Exceeded ${MAX_TOTAL_MS}ms budget at exchange ${exchange}`);
      }

      const clinicStart = Date.now() - runStart;
      const clinicTurn = await clinic.sendUserTurn(lastText);
      throwIfAborted(signal);
      await emitTurn("clinic", clinicTurn, clinicStart);
      lastText = clinicTurn.transcript;

      const advocateResult = await advocateRespond(advocate, lastText, turns, runStart, timing, hooks);
      throwIfAborted(signal);

      if (advocateResult.type === "complete") {
        outcome = advocateResult.outcome;
        await invokeHook(onOutcome, outcome);
        turns.push({
          role: "outcome",
          outcome,
          startMs: Date.now() - runStart,
        });
        callComplete = true;
        break;
      }

      await emitTurn("advocate", advocateResult, advocateResult.audioStartMs);
      lastText = advocateResult.transcript;
    }

    const elapsedMs = Date.now() - runStart;
    const effectiveElapsedMs = elapsedMs - timing.handoffPauseMs;

    if (effectiveElapsedMs >= MAX_TOTAL_MS) {
      console.warn(
        `Warning: effective runtime ${(effectiveElapsedMs / 1000).toFixed(1)}s exceeded ${MAX_TOTAL_MS / 1000}s budget (handoff pause excluded: ${(timing.handoffPauseMs / 1000).toFixed(1)}s)`
      );
    }

    if (!callComplete) {
      await invokeHook(onEnd, { reason: "exchanges_exhausted" });
    }

    const manifest = writeManifest(runDir, turns, elapsedMs, outcome);
    markGood(runDir, manifest);

    return {
      runDir,
      manifest,
      turns,
      outcome,
      elapsedMs,
      handoffPauseMs: timing.handoffPauseMs,
      callComplete,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    advocate.close();
    clinic.close();
  }
}
