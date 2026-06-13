import WebSocket from "ws";

const WS_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";

export class GrokSession {
  constructor({
    apiKey,
    voice,
    instructions,
    tools,
    turnTimeoutMs = 20000,
    label = "session",
    outputSpeed,
  }) {
    this.apiKey = apiKey;
    this.voice = voice;
    this.instructions = instructions;
    this.tools = tools || [];
    this.turnTimeoutMs = turnTimeoutMs;
    this.label = label;
    this.outputSpeed = outputSpeed;
    this.ws = null;
    this.pendingTurn = null;
    this.useForceMessageFallback = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      ws.once("open", () => {
        this.ws = ws;
        ws.on("message", (data) => this.#onMessage(data));
        ws.on("error", (err) => this.#rejectPending(err));
        ws.on("close", () => this.#rejectPending(new Error(`${this.label}: socket closed`)));
        resolve();
      });

      ws.once("error", (err) => {
        reject(new Error(`${this.label}: connect failed: ${err.message}`));
      });
    });
  }

  configure() {
    const session = {
      voice: this.voice,
      instructions: this.instructions,
      turn_detection: null,
      audio: {
        input: { format: { type: "audio/pcm", rate: 24000 } },
        output: {
          format: { type: "audio/pcm", rate: 24000 },
          ...(this.outputSpeed ? { speed: this.outputSpeed } : {}),
        },
      },
    };
    if (this.tools.length > 0) {
      session.tools = this.tools;
    }
    this.#send({ type: "session.update", session });
  }

  async openWith(text) {
    if (this.useForceMessageFallback) {
      return this.#runTurn(() => {
        this.#send({
          type: "response.create",
          response: {
            instructions: `Open by saying exactly: "${text}"`,
          },
        });
      });
    }

    try {
      return await this.#runTurn(() => {
        this.#send({
          type: "conversation.item.create",
          item: {
            type: "force_message",
            role: "assistant",
            interruptible: false,
            content: [{ type: "output_text", text }],
          },
        });
      });
    } catch (err) {
      console.warn(`${this.label}: force_message failed (${err.message}), using fallback`);
      this.useForceMessageFallback = true;
      return this.openWith(text);
    }
  }

  async sendUserTurn(text) {
    return this.#runTurn(() => {
      this.#send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
      this.#send({ type: "response.create" });
    });
  }

  async sendFunctionResult(callId, outputObj) {
    return this.#runTurn(() => {
      this.#send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(outputObj),
        },
      });
      this.#send({ type: "response.create" });
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  #send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.label}: socket not open`);
    }
    this.ws.send(JSON.stringify(payload));
  }

  #runTurn(sendFn) {
    if (this.pendingTurn) {
      return Promise.reject(new Error(`${this.label}: turn already in progress`));
    }

    return new Promise((resolve, reject) => {
      const state = {
        pcmChunks: [],
        transcriptParts: [],
        transcript: "",
        resolvedType: null,
        timer: setTimeout(() => {
          this.pendingTurn = null;
          reject(new Error(`${this.label}: turn timed out after ${this.turnTimeoutMs}ms`));
        }, this.turnTimeoutMs),
        resolve: (result) => {
          clearTimeout(state.timer);
          this.pendingTurn = null;
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(state.timer);
          this.pendingTurn = null;
          reject(err);
        },
      };

      this.pendingTurn = state;
      sendFn();
    });
  }

  #rejectPending(err) {
    if (this.pendingTurn) {
      this.pendingTurn.reject(err);
    }
  }

  #onMessage(data) {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (event.type === "error") {
      const msg = event.error?.message || JSON.stringify(event.error || event);
      this.#rejectPending(new Error(`${this.label}: ${msg}`));
      return;
    }

    if (!this.pendingTurn) return;

    const turn = this.pendingTurn;

    if (event.type === "response.output_audio.delta" && event.delta) {
      turn.pcmChunks.push(Buffer.from(event.delta, "base64"));
    }

    if (event.type === "response.output_audio_transcript.delta" && event.delta) {
      turn.transcriptParts.push(event.delta);
    }

    if (event.type === "response.output_audio_transcript.done") {
      turn.transcript = event.transcript || turn.transcriptParts.join("");
    }

    if (event.type === "response.function_call_arguments.done") {
      if (turn.resolvedType) return;

      if (turn.pcmChunks.length > 0) {
        console.warn(
          `${this.label}: function_call resolved with ${turn.pcmChunks.length} audio chunks (ignored)`
        );
      }

      turn.resolvedType = "function_call";
      let args;
      try {
        args = JSON.parse(event.arguments || "{}");
      } catch {
        args = {};
      }
      turn.resolve({
        type: "function_call",
        name: event.name,
        callId: event.call_id,
        args,
      });
      return;
    }

    if (event.type === "response.done") {
      if (turn.resolvedType) return;

      turn.resolvedType = "audio";
      const transcript =
        turn.transcript ||
        turn.transcriptParts.join("") ||
        event.response?.output?.[0]?.content?.[0]?.transcript ||
        event.response?.output?.[0]?.content?.[0]?.text ||
        "";

      const pcm = Buffer.concat(turn.pcmChunks);
      turn.resolve({ type: "audio", transcript: transcript.trim(), pcm });
    }
  }
}
