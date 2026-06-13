import "dotenv/config";
import WebSocket from "ws";

const API_KEY = process.env.X_AI_API_KEY;
const WS_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const OPENING =
  "Hello, I'm calling on behalf of a patient regarding a denied MRI claim. I'd like to discuss the denial and request a review.";

if (!API_KEY) {
  console.error("Missing X_AI_API_KEY in .env");
  process.exit(1);
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    ws.once("open", () => resolve({ ws, label }));
    ws.once("error", reject);
  });
}

function waitForEvents(ws, wanted, timeoutMs = 30000) {
  const seen = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`Timeout waiting for ${wanted.join("|")}. Seen: ${seen.join(", ")}`));
    }, timeoutMs);

    function onMessage(data) {
      const event = JSON.parse(data.toString());
      seen.push(event.type);
      if (wanted.every((t) => seen.includes(t))) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve({ seen, last: event });
      }
    }
    ws.on("message", onMessage);
  });
}

function configure(ws) {
  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        voice: "eve",
        instructions: "You are a test assistant. Respond in at most 2 sentences.",
        turn_detection: null,
        audio: {
          input: { format: { type: "audio/pcm", rate: 24000 } },
          output: { format: { type: "audio/pcm", rate: 24000 } },
        },
      },
    })
  );
}

async function probeForceMessage() {
  console.log("\n=== Probe 1: force_message (no response.create) ===");
  const { ws } = await connect("force_message");
  configure(ws);

  ws.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "force_message",
        role: "assistant",
        interruptible: false,
        content: [{ type: "output_text", text: OPENING }],
      },
    })
  );

  try {
    const { seen } = await waitForEvents(ws, [
      "response.output_audio.delta",
      "response.done",
    ]);
    console.log("PASS: force_message emitted", seen.filter((t) => t.startsWith("response")).join(", "));
    ws.close();
    return true;
  } catch (err) {
    console.log("FAIL:", err.message);
    console.log("Trying fallback: response.create + instructions...");
    ws.close();

    const { ws: ws2 } = await connect("fallback");
    configure(ws2);
    ws2.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions: `Open by saying exactly: "${OPENING}"`,
        },
      })
    );
    const { seen } = await waitForEvents(ws2, [
      "response.output_audio.delta",
      "response.done",
    ]);
    console.log("PASS (fallback):", seen.filter((t) => t.startsWith("response")).join(", "));
    ws2.close();
    return "fallback";
  }
}

async function probeConcurrent() {
  console.log("\n=== Probe 2: two concurrent WS sessions ===");
  const [a, b] = await Promise.all([connect("session-a"), connect("session-b")]);
  configure(a.ws);
  configure(b.ws);
  console.log("PASS: both sessions connected simultaneously");
  a.ws.close();
  b.ws.close();
  return true;
}

async function main() {
  const forceResult = await probeForceMessage();
  await probeConcurrent();
  console.log("\n=== Probe complete ===");
  console.log("force_message mode:", forceResult === "fallback" ? "use fallback" : "use force_message");
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});
