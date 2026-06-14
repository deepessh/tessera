"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_ORCH_WS_URL ?? "";
const PLAYBACK_SPEED = 1.5;
const CLINIC_READ_DWELL_MS = 3000;
const CLINIC_READ_MS_PER_WORD = 280;
const CLINIC_READ_MIN_MS = 2000;
const CLINIC_READ_MAX_MS = 6000;
const WS_RECONNECT_MS = 2000;

function scaledMs(ms) {
  return Math.round(ms / PLAYBACK_SPEED);
}

/** @param {HTMLMediaElement} audio */
function applyPlaybackSpeed(audio) {
  audio.preservesPitch = true;
  // Legacy vendor flags — harmless on browsers that ignore them.
  audio.webkitPreservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.defaultPlaybackRate = PLAYBACK_SPEED;
  audio.playbackRate = PLAYBACK_SPEED;
}

function clinicReadDwellMs(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const estimated = words * CLINIC_READ_MS_PER_WORD;
  const clamped = Math.min(CLINIC_READ_MAX_MS, Math.max(CLINIC_READ_MIN_MS, estimated));
  return scaledMs(clamped);
}

/** Server error when a second decision arrives after the gate closed — safe to ignore. */
const BENIGN_HANDOFF_ERROR = "No handoff is waiting for a decision";

/** Minimal silent WAV for autoplay unlock. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

/**
 * @typedef {"idle" | "calling" | "handoff" | "done"} Phase
 * @typedef {"idle" | "connecting" | "advocate" | "insurer" | "paused" | "done"} PillState
 */

/**
 * @param {import("react").Dispatch<import("react").SetStateAction<Phase>>} setPhase
 * @param {import("react").Dispatch<import("react").SetStateAction<PillState>>} setPillState
 * @param {import("react").Dispatch<import("react").SetStateAction<{ role: string, text: string }[]>>} setTurns
 * @param {import("react").Dispatch<import("react").SetStateAction<{ reason: string, options: { id: string, label: string }[] } | null>>} setHandoff
 * @param {import("react").Dispatch<import("react").SetStateAction<object | null>>} setOutcome
 * @param {import("react").Dispatch<import("react").SetStateAction<boolean>>} setTerminalOnly
 * @param {import("react").Dispatch<import("react").SetStateAction<boolean>>} setChoosing
 * @param {import("react").Dispatch<import("react").SetStateAction<string | null>>} setError
 * @param {import("react").MutableRefObject<boolean>} callActiveRef
 * @param {() => void} onHandoffShown
 * @param {() => void} onCallFinished
 */
function createQueueProcessor({
  setPhase,
  setPillState,
  setTurns,
  setHandoff,
  setOutcome,
  setTerminalOnly,
  setChoosing,
  setError,
  audioRef,
  handoffWaitRef,
  callActiveRef,
  onHandoffShown,
  onCallFinished,
}) {
  /** @type {object[]} */
  const queue = [];
  let draining = false;
  let sawOutcome = false;
  /** @type {(() => void) | null} */
  let playbackFinishRef = null;
  /** @type {(() => void) | null} */
  let dwellFinishRef = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let dwellTimer = null;

  function stopAdvocatePlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.oncanplay = null;
      audio.pause();
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
    }
    if (playbackFinishRef) {
      playbackFinishRef();
      playbackFinishRef = null;
    }
  }

  function resolveHandoffWait() {
    const resolve = handoffWaitRef.current;
    if (resolve) {
      handoffWaitRef.current = null;
      resolve();
    }
  }

  function waitDwell(ms) {
    return new Promise((resolve) => {
      dwellFinishRef = resolve;
      dwellTimer = setTimeout(() => {
        dwellTimer = null;
        dwellFinishRef = null;
        resolve();
      }, ms);
    });
  }

  /** @param {string} base64 @param {number} [durMs] */
  function playAdvocateAudio(base64, durMs) {
    const audio = audioRef.current;
    if (!audio) {
      return new Promise((resolve) =>
        setTimeout(resolve, scaledMs(durMs || CLINIC_READ_DWELL_MS))
      );
    }

    return new Promise((resolve) => {
      const finish = () => {
        playbackFinishRef = null;
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplay = null;
        audio.playbackRate = 1;
        audio.defaultPlaybackRate = 1;
        resolve();
      };

      const startPlayback = () => {
        applyPlaybackSpeed(audio);
        audio.play().catch(() => {
          setTimeout(finish, scaledMs(durMs || CLINIC_READ_DWELL_MS));
        });
      };

      stopAdvocatePlayback();
      playbackFinishRef = finish;
      audio.onended = finish;
      audio.onerror = finish;
      audio.src = `data:audio/wav;base64,${base64}`;
      audio.load();
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        startPlayback();
      } else {
        audio.oncanplay = () => {
          audio.oncanplay = null;
          startPlayback();
        };
      }
    });
  }

  function waitForHandoffDecision() {
    // No client-side timeout — server auto-resolve sends turn/outcome/end which unblocks via enqueue.
    return new Promise((resolve) => {
      handoffWaitRef.current = () => {
        handoffWaitRef.current = null;
        resolve();
      };
    });
  }

  /** @param {object} item */
  async function processItem(item) {
    if (!callActiveRef.current) return;

    switch (item.type) {
      case "turn": {
        const role = item.role === "advocate" ? "advocate" : "clinic";
        setPillState(role === "advocate" ? "advocate" : "insurer");
        setTurns((prev) => [...prev, { role, text: item.text }]);

        if (role === "advocate" && item.audioBase64) {
          await playAdvocateAudio(item.audioBase64, item.durMs);
        } else if (role === "clinic") {
          await waitDwell(clinicReadDwellMs(item.text));
        } else {
          await waitDwell(scaledMs(item.durMs || CLINIC_READ_DWELL_MS));
        }
        break;
      }
      case "handoff": {
        setPhase("handoff");
        setPillState("paused");
        setHandoff({ reason: item.reason, options: item.options });
        setChoosing(false);
        onHandoffShown();
        await waitForHandoffDecision();
        if (!callActiveRef.current) return;
        setPhase("calling");
        setHandoff(null);
        setPillState("connecting");
        break;
      }
      case "outcome": {
        if (!callActiveRef.current) return;
        sawOutcome = true;
        setPhase("done");
        setPillState("done");
        setOutcome({
          status: item.status,
          summary: item.summary,
          next_steps: item.next_steps,
          reference_number: item.reference_number,
        });
        onCallFinished();
        break;
      }
      case "end": {
        if (!callActiveRef.current) return;
        setPhase("done");
        setPillState("done");
        if (!sawOutcome) {
          setTerminalOnly(true);
        }
        onCallFinished();
        break;
      }
      default:
        break;
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        await processItem(item);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Playback failed");
      }
    }
    draining = false;
  }

  return {
    enqueue(item) {
      if (!callActiveRef.current) return;

      // Server auto-resolved handoff (timeout) and continued — unblock the wait.
      if (
        handoffWaitRef.current &&
        (item.type === "turn" || item.type === "outcome" || item.type === "end")
      ) {
        resolveHandoffWait();
      }
      queue.push(item);
      void drain();
    },
    reset() {
      queue.length = 0;
      draining = false;
      sawOutcome = false;
      playbackFinishRef = null;
      stopAdvocatePlayback();
      if (dwellTimer) clearTimeout(dwellTimer);
      dwellTimer = null;
      dwellFinishRef = null;
      resolveHandoffWait();
    },
    resolveHandoffWait,
  };
}

export function useCallSession() {
  /** @type {[Phase, Function]} */
  const [phase, setPhase] = useState("idle");
  /** @type {[PillState, Function]} */
  const [pillState, setPillState] = useState("idle");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [claim, setClaim] = useState(null);
  const [turns, setTurns] = useState([]);
  const [handoff, setHandoff] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [terminalOnly, setTerminalOnly] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(null);
  const [wsReady, setWsReady] = useState(false);

  const wsRef = useRef(null);
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const handoffWaitRef = useRef(null);
  const queueRef = useRef(null);
  const callActiveRef = useRef(false);
  const startingRef = useRef(false);
  const handoffChosenRef = useRef(false);
  const abortToIdleRef = useRef(/** @type {(message?: string) => void} */ (null));
  const onHandoffShownRef = useRef(/** @type {() => void} */ (null));

  const wsConfigured = Boolean(WS_URL);

  const abortToIdle = useCallback((message) => {
    if (!callActiveRef.current) return;

    callActiveRef.current = false;
    startingRef.current = false;
    handoffChosenRef.current = false;
    queueRef.current?.reset();
    setHandoff(null);
    setChoosing(false);
    setPhase("idle");
    setPillState("idle");
    setHeaderCollapsed(false);
    setOutcome(null);
    setTerminalOnly(false);

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }

    if (message) setError(message);
  }, []);

  abortToIdleRef.current = abortToIdle;

  onHandoffShownRef.current = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "handoff_ready" }));
    }
  };

  if (!queueRef.current) {
    queueRef.current = createQueueProcessor({
      setPhase,
      setPillState,
      setTurns,
      setHandoff,
      setOutcome,
      setTerminalOnly,
      setChoosing,
      setError,
      audioRef,
      handoffWaitRef,
      callActiveRef,
      onHandoffShown: () => onHandoffShownRef.current?.(),
      onCallFinished: () => {
        callActiveRef.current = false;
      },
    });
  }

  useEffect(() => {
    if (!wsConfigured) return;

    let ws = null;
    let reconnectTimer = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsReady(true);
        if (!callActiveRef.current) {
          setError(null);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsReady(false);
        if (callActiveRef.current) {
          abortToIdleRef.current?.("Connection to the advocate lost");
        }
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, WS_RECONNECT_MS);
        }
      };

      ws.onerror = () => {
        if (!callActiveRef.current) {
          setError("Could not connect to the local advocate");
        }
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "claim":
            setClaim({
              claimNumber: msg.claimNumber,
              service: msg.service,
              claimAmount: msg.claimAmount,
              goal: msg.goal,
              denialCode: msg.denialCode,
              denialReason: msg.denialReason,
            });
            break;
          case "turn":
          case "handoff":
          case "outcome":
          case "end":
            queueRef.current?.enqueue(msg);
            break;
          case "error":
            if (callActiveRef.current) {
              if (msg.message === BENIGN_HANDOFF_ERROR) break;
              abortToIdleRef.current?.(msg.message);
            } else {
              setError(msg.message);
              queueRef.current?.resolveHandoffWait();
            }
            break;
          case "status":
            if (msg.phase === "done") {
              queueRef.current?.resolveHandoffWait();
            }
            break;
          default:
            break;
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      callActiveRef.current = false;
      startingRef.current = false;
      ws?.close();
      wsRef.current = null;
    };
  }, [wsConfigured]);

  const unlockAudio = useCallback(async () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      const ctx = audioCtxRef.current ?? new AudioContextCtor();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    }

    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = true;
    audio.src = SILENT_WAV;
    try {
      await audio.play();
    } catch {
      /* autoplay may still reject until user gesture — Start click satisfies that */
    }
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.removeAttribute("src");
  }, []);

  const startCall = useCallback(
    async (mode = "live") => {
      if (
        !wsConfigured ||
        !wsReady ||
        !wsRef.current ||
        startingRef.current ||
        callActiveRef.current
      ) {
        return;
      }

      startingRef.current = true;
      callActiveRef.current = true;
      setError(null);
      setHeaderCollapsed(true);
      setPhase("calling");
      setPillState("connecting");
      setTurns([]);
      setHandoff(null);
      setOutcome(null);
      setTerminalOnly(false);
      setChoosing(false);
      handoffChosenRef.current = false;
      queueRef.current?.reset();

      try {
        await unlockAudio();
        wsRef.current.send(JSON.stringify({ type: "start", mode }));
      } catch (err) {
        callActiveRef.current = false;
        setPhase("idle");
        setPillState("idle");
        setHeaderCollapsed(false);
        setError(err instanceof Error ? err.message : "Could not start call");
      } finally {
        startingRef.current = false;
      }
    },
    [unlockAudio, wsConfigured, wsReady]
  );

  const chooseHandoffOption = useCallback((option) => {
    if (
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN ||
      handoffChosenRef.current
    ) {
      return;
    }

    handoffChosenRef.current = true;
    setChoosing(true);
    wsRef.current.send(
      JSON.stringify({
        type: "decision",
        choice: option.id,
        label: option.label,
        note: "",
      })
    );

    queueRef.current?.resolveHandoffWait();
  }, []);

  return {
    wsConfigured,
    wsReady,
    phase,
    pillState,
    headerCollapsed,
    claim,
    turns,
    handoff,
    outcome,
    terminalOnly,
    choosing,
    error,
    audioRef,
    startCall,
    chooseHandoffOption,
  };
}
