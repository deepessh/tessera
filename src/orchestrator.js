import "dotenv/config";
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
  requestDecision,
} from "./scenario.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT, "runs");

const API_KEY = process.env.X_AI_API_KEY;
const EXCHANGES = 4;
const TURN_TIMEOUT_MS = 20000;
const MAX_TOTAL_MS = 90000;
const SAMPLE_RATE = 24000;

const ADVOCATE_VOICE = "eve";
const CLINIC_VOICE = "rex";

if (!API_KEY) {
  console.error("Missing X_AI_API_KEY in .env");
  process.exit(1);
}

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

async function advocateRespond(advocate, text, turns, runStart) {
  let result = await advocate.sendUserTurn(text);

  while (result.type === "function_call") {
    const eventStart = Date.now() - runStart;

    if (result.name === "request_patient_input") {
      turns.push({
        role: "tool_call",
        tool: result.name,
        args: result.args,
        startMs: eventStart,
      });

      const decision = await requestDecision(result.args);

      turns.push({
        role: "handoff",
        reason: result.args.reason,
        options: result.args.options,
        decision,
        startMs: Date.now() - runStart,
      });

      result = await advocate.sendFunctionResult(result.callId, decision);
    } else if (result.name === "complete_call") {
      turns.push({
        role: "tool_call",
        tool: result.name,
        args: result.args,
        startMs: eventStart,
      });
      return { type: "complete", outcome: result.args };
    } else {
      throw new Error(`Unknown advocate tool: ${result.name}`);
    }
  }

  return result;
}

async function main() {
  const runDir = createRunDir();
  const runStart = Date.now();
  const turns = [];
  let turnIndex = 0;
  let outcome = null;

  console.log(`Run directory: ${runDir}`);
  console.log(`Target: ${EXCHANGES} advocate<->clinic round-trips after opening, < ${MAX_TOTAL_MS / 1000}s total`);

  const advocate = new GrokSession({
    apiKey: API_KEY,
    voice: ADVOCATE_VOICE,
    instructions: advocateInstructions(PATIENT_CONTEXT),
    tools: ADVOCATE_TOOLS,
    turnTimeoutMs: TURN_TIMEOUT_MS,
    label: "advocate",
  });

  const clinic = new GrokSession({
    apiKey: API_KEY,
    voice: CLINIC_VOICE,
    instructions: CLINIC_INSTRUCTIONS,
    turnTimeoutMs: TURN_TIMEOUT_MS,
    label: "clinic",
  });

  try {
    await Promise.all([advocate.connect(), clinic.connect()]);
    advocate.configure();
    clinic.configure();

    const openingText = advocateOpening(PATIENT_CONTEXT);
    const openingStart = Date.now() - runStart;
    console.log(`\n[turn ${turnIndex}] advocate (opening)`);
    const opening = await advocate.openWith(openingText);
    console.log(`  transcript: ${opening.transcript}`);
    turns.push(saveTurn(runDir, turnIndex++, "advocate", opening, openingStart));

    let lastSpeaker = "advocate";
    let lastText = opening.transcript;
    let callComplete = false;

    for (let exchange = 1; exchange <= EXCHANGES && !callComplete; exchange++) {
      const elapsed = Date.now() - runStart;
      if (elapsed > MAX_TOTAL_MS) {
        throw new Error(`Exceeded ${MAX_TOTAL_MS}ms budget at exchange ${exchange}`);
      }

      const clinicStart = Date.now() - runStart;
      console.log(`\n[turn ${turnIndex}] clinic (exchange ${exchange}/${EXCHANGES})`);
      const clinicTurn = await clinic.sendUserTurn(lastText);
      console.log(`  transcript: ${clinicTurn.transcript}`);
      turns.push(saveTurn(runDir, turnIndex++, "clinic", clinicTurn, clinicStart));
      lastSpeaker = "clinic";
      lastText = clinicTurn.transcript;

      const advocateStart = Date.now() - runStart;
      console.log(`\n[turn ${turnIndex}] advocate (exchange ${exchange}/${EXCHANGES})`);
      const advocateResult = await advocateRespond(advocate, lastText, turns, runStart);

      if (advocateResult.type === "complete") {
        outcome = advocateResult.outcome;
        turns.push({
          role: "outcome",
          outcome,
          startMs: Date.now() - runStart,
        });
        console.log(`  complete_call: ${JSON.stringify(outcome)}`);
        callComplete = true;
        break;
      }

      console.log(`  transcript: ${advocateResult.transcript}`);
      turns.push(saveTurn(runDir, turnIndex++, "advocate", advocateResult, advocateStart));
      lastSpeaker = "advocate";
      lastText = advocateResult.transcript;
    }

    const elapsedMs = Date.now() - runStart;
    const manifest = writeManifest(runDir, turns, elapsedMs, outcome);
    markGood(runDir, manifest);

    console.log(`\n=== Run complete ===`);
    console.log(`Turns: ${turns.length} (${turns.filter((t) => t.role === "advocate" && t.type === "audio").length} advocate audio, ${turns.filter((t) => t.role === "clinic").length} clinic)`);
    if (outcome) {
      console.log(`Outcome: ${outcome.status} — ${outcome.summary}`);
      console.log(`Reference: ${outcome.reference_number}`);
    }
    console.log(`Exchanges: ${EXCHANGES} round-trips${callComplete ? " (ended early via complete_call)" : ""}`);
    console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`Last speaker: ${lastSpeaker}`);
    console.log(`Marked good: runs/last-good.json`);

    if (elapsedMs >= MAX_TOTAL_MS) {
      throw new Error(`Run exceeded ${MAX_TOTAL_MS}ms gate`);
    }
  } finally {
    advocate.close();
    clinic.close();
  }
}

main().catch((err) => {
  console.error("\nOrchestrator failed:", err.message);
  process.exit(1);
});
