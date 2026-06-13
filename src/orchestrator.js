import "dotenv/config";
import { runCall } from "./runCall.js";
import { requestDecision } from "./scenario.js";

let turnLogIndex = 0;

async function main() {
  console.log(`Target: 4 advocate<->clinic round-trips after opening, < 90s total`);

  const result = await runCall({
    requestDecision,
    onTurn(turn) {
      const label =
        turn.role === "advocate" && turnLogIndex === 0
          ? "advocate (opening)"
          : `${turn.role}`;
      console.log(`\n[turn ${turnLogIndex}] ${label}`);
      console.log(`  transcript: ${turn.text}`);
      turnLogIndex++;
    },
    onHandoff({ reason, options }) {
      console.log(`\n[handoff] ${reason}`);
      console.log(`  options: ${JSON.stringify(options)}`);
    },
    onOutcome(outcome) {
      console.log(`  complete_call: ${JSON.stringify(outcome)}`);
    },
  });

  console.log(`\nRun directory: ${result.runDir}`);
  console.log(`\n=== Run complete ===`);
  console.log(
    `Turns: ${result.turns.length} (${result.turns.filter((t) => t.role === "advocate" && t.type === "audio").length} advocate audio, ${result.turns.filter((t) => t.role === "clinic").length} clinic)`
  );
  if (result.outcome) {
    console.log(`Outcome: ${result.outcome.status} — ${result.outcome.summary}`);
    console.log(`Reference: ${result.outcome.reference_number}`);
  }
  console.log(
    `Exchanges: 4 round-trips${result.callComplete ? " (ended early via complete_call)" : ""}`
  );
  console.log(
    `Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s (handoff pause excluded: ${(result.handoffPauseMs / 1000).toFixed(1)}s)`
  );
  console.log(`Marked good: runs/last-good.json`);
}

main().catch((err) => {
  console.error("\nOrchestrator failed:", err.message);
  process.exit(1);
});
