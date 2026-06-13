"use client";

import { useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_ORCH_WS_URL ?? "";

export default function SpikePage() {
  const wsRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState([]);

  function append(line) {
    setLog((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} ${line}`]);
  }

  function connect() {
    if (!WS_URL) {
      setStatus("error");
      append("NEXT_PUBLIC_ORCH_WS_URL is unset");
      return;
    }

    wsRef.current?.close();
    setStatus("connecting");
    append(`opening ${WS_URL}`);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      append("socket open — sending ping");
      ws.send("ping");
    };
    ws.onmessage = (event) => append(`recv: ${event.data}`);
    ws.onerror = () => {
      setStatus("error");
      append("socket error (check Chrome LNA permission for https → 127.0.0.1)");
    };
    ws.onclose = (event) => {
      setStatus("closed");
      append(`socket closed code=${event.code} reason=${event.reason || "(none)"}`);
    };
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
  }

  return (
    <main>
      <h1>Phase 2.0a — WS connectivity spike</h1>
      <p>
        Target: <code>{WS_URL || "(unset — set NEXT_PUBLIC_ORCH_WS_URL)"}</code>
      </p>
      <p>
        Run <code>npm run echo</code> in the repo root, then click Connect from this
        https page. Chrome should prompt for Local Network Access; grant it and confirm
        status stays <strong>open</strong> after echo.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button type="button" onClick={connect}>
          Connect
        </button>
        <button type="button" onClick={disconnect}>
          Disconnect
        </button>
      </div>
      <p>
        Status: <strong>{status}</strong>
      </p>
      <pre
        style={{
          background: "#f4f4f4",
          padding: "1rem",
          minHeight: "8rem",
          whiteSpace: "pre-wrap",
        }}
      >
        {log.length ? log.join("\n") : "No events yet."}
      </pre>
    </main>
  );
}
