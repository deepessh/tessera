import "dotenv/config";
import { WebSocketServer } from "ws";

const port = Number(process.env.ORCH_PORT) || 8787;
const wss = new WebSocketServer({ host: "127.0.0.1", port });

wss.on("connection", (ws, req) => {
  const origin = req.headers.origin ?? "(none)";
  console.log(`client connected from origin: ${origin}`);
  ws.send(JSON.stringify({ type: "connected", port, ts: Date.now() }));
  ws.on("message", (data) => {
    ws.send(data);
    console.log(`echoed: ${data.toString().slice(0, 80)}`);
  });
  ws.on("close", () => console.log("client disconnected"));
});

console.log(`Echo WS server listening on ws://127.0.0.1:${port}`);
