import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { runCall } from "./runCall.js";
import { PATIENT_CONTEXT, buildDecision, DEFAULT_DECISION } from "./scenario.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT, "runs");

const port = Number(process.env.ORCH_PORT) || 8787;
const HANDOFF_TIMEOUT_MS = Number(process.env.HANDOFF_TIMEOUT_MS) || 120_000;

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function buildClaimMessage() {
  const ctx = PATIENT_CONTEXT;
  return {
    type: "claim",
    claimNumber: ctx.claimNumber,
    service: ctx.serviceRequested,
    claimAmount: ctx.claimAmount,
    goal: ctx.goal,
    denialCode: ctx.denialCode,
    denialReason: ctx.denialReason,
  };
}

function readAudioBase64(wavPath) {
  const abs = path.isAbsolute(wavPath) ? wavPath : path.join(ROOT, wavPath);
  if (!fs.existsSync(abs)) return undefined;
  return fs.readFileSync(abs).toString("base64");
}

function loadManifest() {
  const lastGoodPath = path.join(RUNS_DIR, "last-good.json");
  if (fs.existsSync(lastGoodPath)) {
    const pointer = JSON.parse(fs.readFileSync(lastGoodPath, "utf8"));
    const runDir = path.isAbsolute(pointer.runDir)
      ? pointer.runDir
      : path.join(ROOT, pointer.runDir);
    const manifestPath = path.join(runDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      return { runDir, manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) };
    }
    return { runDir, manifest: pointer };
  }

  const runDirs = fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const name of runDirs) {
    const manifestPath = path.join(RUNS_DIR, name, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      return {
        runDir: path.join(RUNS_DIR, name),
        manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
      };
    }
  }

  throw new Error("No run manifest found. Run npm start first.");
}

function resolveSafeFallback(options, fallbackDecision) {
  try {
    return fallbackDecision();
  } catch {
    try {
      return buildDecision(DEFAULT_DECISION, options);
    } catch {
      const first = options?.[0];
      if (first) {
        return { choice: first.id, label: first.label, note: "" };
      }
      return { choice: "unknown", label: "Auto-resolved", note: "" };
    }
  }
}

function clearDecisionGate(ws) {
  const gate = ws.__decisionGate;
  if (!gate) return;
  gate.cleanup();
  ws.__decisionGate = null;
}

function createDecisionGate(ws, options, fallbackDecision, signal) {
  let settled = false;

  return new Promise((resolve, reject) => {
    const finish = (decision) => {
      if (settled) return;
      settled = true;
      cleanup();
      ws.__decisionGate = null;
      resolve(decision);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      ws.__decisionGate = null;
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };

    const onClose = () => {
      console.warn("Client disconnected during handoff — using fallback decision");
      finish(resolveSafeFallback(options, fallbackDecision));
    };

    const onAbort = () => {
      fail(new Error("Client disconnected"));
    };

    const timeout = setTimeout(() => {
      console.warn("Handoff timed out — using fallback decision");
      finish(resolveSafeFallback(options, fallbackDecision));
    }, HANDOFF_TIMEOUT_MS);

    if (signal) {
      if (signal.aborted) {
        fail(new Error("Client disconnected"));
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    ws.__decisionGate = {
      options,
      cleanup,
      resolve(decision) {
        finish(decision);
      },
    };

    ws.on("close", onClose);
  });
}

function resolveBrowserDecision(ws, { choice }) {
  const gate = ws.__decisionGate;
  if (!gate) {
    send(ws, { type: "error", message: "No handoff is waiting for a decision" });
    return;
  }
  try {
    gate.resolve(buildDecision(choice, gate.options));
  } catch (err) {
    send(ws, { type: "error", message: err.message });
  }
}

async function runLiveSession(ws, signal) {
  send(ws, { type: "status", phase: "calling" });

  await runCall({
    apiKey: process.env.X_AI_API_KEY,
    signal,
    onTurn(turn) {
      const msg = {
        type: "turn",
        role: turn.role,
        text: turn.text,
        durMs: turn.durMs,
      };
      if (turn.role === "advocate" && turn.wavPath) {
        const audioBase64 = readAudioBase64(turn.wavPath);
        if (audioBase64) msg.audioBase64 = audioBase64;
      }
      send(ws, msg);
    },
    onHandoff({ reason, options }) {
      send(ws, { type: "status", phase: "handoff" });
      send(ws, { type: "handoff", reason, options });
    },
    onOutcome(outcome) {
      send(ws, { type: "status", phase: "done" });
      send(ws, { type: "outcome", ...outcome });
    },
    onEnd({ reason }) {
      send(ws, { type: "status", phase: "done" });
      send(ws, { type: "end", reason });
    },
    requestDecision({ options }) {
      return createDecisionGate(
        ws,
        options,
        () => buildDecision(DEFAULT_DECISION, options),
        signal
      );
    },
  });
}

async function runReplaySession(ws, signal) {
  const { manifest } = loadManifest();
  const turns = manifest.turns || [];

  if (turns.length === 0) {
    throw new Error("Manifest has no turns to replay.");
  }

  send(ws, { type: "status", phase: "calling" });

  let sawOutcome = false;

  for (const turn of turns) {
    if (signal?.aborted) {
      throw new Error("Client disconnected");
    }

    if (turn.role === "tool_call") {
      continue;
    }

    if (turn.type === "audio") {
      const msg = {
        type: "turn",
        role: turn.role,
        text: turn.text,
        durMs: turn.durMs,
      };
      if (turn.role === "advocate" && turn.wavPath) {
        const audioBase64 = readAudioBase64(turn.wavPath);
        if (audioBase64) msg.audioBase64 = audioBase64;
      }
      send(ws, msg);
      continue;
    }

    if (turn.role === "handoff") {
      send(ws, { type: "status", phase: "handoff" });
      send(ws, { type: "handoff", reason: turn.reason, options: turn.options });

      const fallback = () => {
        if (turn.decision?.choice) {
          return buildDecision(turn.decision.choice, turn.options);
        }
        return buildDecision(DEFAULT_DECISION, turn.options);
      };

      await createDecisionGate(ws, turn.options, fallback, signal);
      continue;
    }

    if (turn.role === "outcome") {
      sawOutcome = true;
      send(ws, { type: "status", phase: "done" });
      send(ws, { type: "outcome", ...turn.outcome });
      continue;
    }
  }

  if (!sawOutcome) {
    if (manifest.outcome) {
      send(ws, { type: "status", phase: "done" });
      send(ws, { type: "outcome", ...manifest.outcome });
    } else {
      send(ws, { type: "status", phase: "done" });
      send(ws, { type: "end", reason: "replay_complete" });
    }
  }
}

function handleConnection(ws, req) {
  const origin = req.headers.origin ?? "(none)";
  console.log(`client connected from origin: ${origin}`);

  let running = false;
  let sessionAbort = null;

  send(ws, buildClaimMessage());

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON message" });
      return;
    }

    if (msg.type === "decision") {
      resolveBrowserDecision(ws, { choice: msg.choice });
      return;
    }

    if (msg.type !== "start") {
      send(ws, { type: "error", message: `Unknown message type: ${msg.type}` });
      return;
    }

    if (running) {
      send(ws, { type: "error", message: "A call is already in progress on this connection" });
      return;
    }

    const mode = msg.mode === "replay" ? "replay" : "live";
    running = true;
    sessionAbort = new AbortController();
    console.log(`starting ${mode} session`);

    try {
      if (mode === "replay") {
        await runReplaySession(ws, sessionAbort.signal);
      } else {
        if (!process.env.X_AI_API_KEY) {
          throw new Error("Missing X_AI_API_KEY in .env");
        }
        await runLiveSession(ws, sessionAbort.signal);
      }
    } catch (err) {
      console.error(`${mode} session failed:`, err.message);
      send(ws, { type: "error", message: err.message });
      send(ws, { type: "status", phase: "done" });
    } finally {
      clearDecisionGate(ws);
      sessionAbort = null;
      running = false;
    }
  });

  ws.on("close", () => {
    console.log("client disconnected");
    if (!running || !sessionAbort) return;

    // During handoff the gate resolves with DEFAULT_DECISION on close — do not abort runCall.
    if (ws.__decisionGate) return;

    sessionAbort.abort();
    clearDecisionGate(ws);
  });
}

const wss = new WebSocketServer({ host: "127.0.0.1", port });

wss.on("connection", handleConnection);

console.log(`Orchestrator WS server listening on ws://127.0.0.1:${port}`);
