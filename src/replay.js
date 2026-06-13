import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT, "runs");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function main() {
  const { runDir, manifest } = loadManifest();
  const turns = manifest.turns || [];

  if (turns.length === 0) {
    throw new Error("Manifest has no turns to replay.");
  }

  console.log(`Replaying run from: ${runDir}`);
  console.log(`Turns: ${turns.length}, elapsed: ${(manifest.elapsedMs / 1000).toFixed(1)}s`);
  console.log("(offline — no API calls)\n");

  const replayStart = Date.now();
  let prevStartMs = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const waitMs = Math.max(0, turn.startMs - prevStartMs);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    prevStartMs = turn.startMs;

    console.log(`[${String(i).padStart(2, "0")}] +${turn.startMs}ms ${turn.role}`);

    if (turn.type === "audio") {
      const wavAbs = path.isAbsolute(turn.wavPath)
        ? turn.wavPath
        : path.join(ROOT, turn.wavPath);
      const wavExists = fs.existsSync(wavAbs);
      const wavSize = wavExists ? fs.statSync(wavAbs).size : 0;

      console.log(`     text: ${turn.text}`);
      console.log(`     audio: ${turn.wavPath} (${wavSize} bytes${wavExists ? "" : " MISSING"})`);
      if (turn.durMs) {
        console.log(`     duration: ${turn.durMs}ms`);
      }
    } else if (turn.role === "tool_call") {
      console.log(`     tool: ${turn.tool}`);
      console.log(`     args: ${JSON.stringify(turn.args)}`);
    } else if (turn.role === "handoff") {
      console.log(`     reason: ${turn.reason}`);
      console.log(`     decision: ${JSON.stringify(turn.decision)}`);
    } else if (turn.role === "outcome") {
      console.log(`     outcome: ${JSON.stringify(turn.outcome)}`);
    } else {
      console.log(`     ${JSON.stringify(turn)}`);
    }
  }

  const replayElapsed = Date.now() - replayStart;
  console.log(`\n=== Replay complete ===`);
  console.log(`Replay wall time: ${(replayElapsed / 1000).toFixed(1)}s`);
  console.log(`Original run time: ${(manifest.elapsedMs / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("Replay failed:", err.message);
  process.exit(1);
});
