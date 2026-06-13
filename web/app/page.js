"use client";

import { useEffect, useRef, useState } from "react";
import { useCallSession } from "../lib/useCallSession";

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l8 3v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V5l8-3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function HandStopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 5v8M12 3v10M16 5v8M6 13v3a2 2 0 002 2h8a2 2 0 002-2v-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 4h3l1.5 5-2 1.5a11 11 0 005 5l1.5-2 5 1.5v3a1.5 1.5 0 01-1.6 1.5C9.8 19.5 4.5 14.2 4.5 5.6A1.5 1.5 0 016 4z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TileMark() {
  return (
    <div className="tile-mark" aria-hidden="true">
      <span className="tile-mark__cell" />
      <span className="tile-mark__cell" />
      <span className="tile-mark__cell" />
      <span className="tile-mark__cell" />
    </div>
  );
}

function ThesisBar() {
  return (
    <header className="thesis-bar">
      <TileMark />
      <span className="thesis-bar__wordmark">Tessera</span>
      <span className="thesis-bar__divider" aria-hidden="true" />
      <p className="thesis-bar__tagline">The patient is the only party on the call without an agent.</p>
    </header>
  );
}

function formatCallTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDenialBadge(code) {
  return `${code} denied`;
}

function formatOutcomeTitle(status) {
  const labels = {
    approved: "Claim approved",
    partial_resolution: "Appeal filed — partial resolution",
    denied: "Claim denied",
    appeal_scheduled: "Appeal filed",
    pending_review: "Pending review",
  };
  return labels[status] ?? "Call complete";
}

function shortService(service) {
  if (!service) return "";
  const lower = service.toLowerCase();
  if (lower.includes("mri") && lower.includes("lumbar")) return "MRI · lower back";
  return service.length > 28 ? `${service.slice(0, 28)}…` : service;
}

function ClaimHeader({ claim, collapsed }) {
  if (!claim) return null;

  return (
    <header className={`claim-header${collapsed ? " claim-header--collapsed" : ""}`}>
      {collapsed ? (
        <div className="claim-header__top">
          <div className="claim-header__compact">
            <span className="claim-header__compact-text">
              {claim.claimNumber} · {shortService(claim.service)} · {claim.claimAmount}
            </span>
          </div>
          <span className="claim-header__badge">{formatDenialBadge(claim.denialCode)}</span>
        </div>
      ) : (
        <>
          <div className="claim-header__top">
            <h2 className="claim-header__title">Denied claim</h2>
            <span className="claim-header__badge">{formatDenialBadge(claim.denialCode)}</span>
          </div>
          <table className="claim-header__table">
            <tbody>
              <tr>
                <td>Claim #</td>
                <td>{claim.claimNumber}</td>
              </tr>
              <tr>
                <td>Service</td>
                <td>{shortService(claim.service)}</td>
              </tr>
              <tr>
                <td>Amount</td>
                <td>{claim.claimAmount}</td>
              </tr>
              <tr>
                <td>Your goal</td>
                <td>{claim.goal}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </header>
  );
}

function StatusPill({ state }) {
  const hidden = state === "idle";

  let dotClass = "status-pill__dot--neutral";
  let labelClass = "status-pill__label--neutral";
  let label = "";

  switch (state) {
    case "connecting":
      label = "Connecting…";
      break;
    case "advocate":
      dotClass = "status-pill__dot--advocate";
      labelClass = "status-pill__label--advocate";
      label = "Tessera speaking";
      break;
    case "insurer":
      label = "Insurer reviewing…";
      break;
    case "paused":
      dotClass = "status-pill__dot--paused";
      labelClass = "status-pill__label--paused";
      label = "Tessera paused — your call to make";
      break;
    case "done":
      label = "Call complete";
      break;
    default:
      break;
  }

  return (
    <div className={`status-pill${hidden ? " status-pill--hidden" : ""}`} aria-live="polite">
      {!hidden && <span className={`status-pill__dot ${dotClass}`} />}
      <span className={`status-pill__label ${labelClass}`}>{label}</span>
    </div>
  );
}

function CallTimer({ seconds }) {
  return <span className="call-timer">{formatCallTimer(seconds)}</span>;
}

function ShowClosingButton({ onClick }) {
  return (
    <button type="button" className="show-closing-button" onClick={onClick}>
      Show closing
    </button>
  );
}

function IdleBody({ claim, onStart, wsConfigured, wsReady }) {
  const canStart = wsConfigured && wsReady && claim;

  return (
    <div className="body-shell">
      <div className="start-card">
        {claim ? (
          <>
            <div className="claim-header__top">
              <h2 className="claim-header__title">Denied claim</h2>
              <span className="claim-header__badge">{formatDenialBadge(claim.denialCode)}</span>
            </div>
            <table className="claim-header__table">
              <tbody>
                <tr>
                  <td>Claim #</td>
                  <td>{claim.claimNumber}</td>
                </tr>
                <tr>
                  <td>Service</td>
                  <td>{shortService(claim.service)}</td>
                </tr>
                <tr>
                  <td>Amount</td>
                  <td>{claim.claimAmount}</td>
                </tr>
                <tr>
                  <td>Your goal</td>
                  <td>{claim.goal}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <p className="transcript-empty">Connecting to Tessera…</p>
        )}
        <button type="button" className="start-button" onClick={onStart} disabled={!canStart}>
          <PhoneIcon />
          Start the call
        </button>
        {!wsConfigured && (
          <p className="start-hint">Set NEXT_PUBLIC_ORCH_WS_URL in web/.env.local</p>
        )}
        {wsConfigured && !wsReady && (
          <p className="start-hint">Waiting for local Tessera server (npm run serve)…</p>
        )}
      </div>
    </div>
  );
}

function CallingBody({ turns }) {
  const transcriptRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  return (
    <div className="body-shell">
      <div className="body-panel">
        <div className="transcript" ref={transcriptRef} role="log" aria-live="polite" aria-relevant="additions">
          {turns.length === 0 ? (
            <p className="transcript-empty">Waiting for Tessera to connect…</p>
          ) : (
            turns.map((turn, index) => {
              const isAdvocate = turn.role === "advocate";
              return (
                <div
                  key={`${turn.role}-${index}`}
                  className={`bubble-row${isAdvocate ? "" : " bubble-row--insurer"}`}
                >
                  <div className={`avatar avatar--${isAdvocate ? "advocate" : "insurer"}`}>
                    {isAdvocate ? <ShieldIcon /> : <BuildingIcon />}
                  </div>
                  <div className={`bubble bubble--${isAdvocate ? "advocate" : "insurer"}`}>
                    {turn.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function HandoffBody({ reason, options, onChoose, choosing }) {
  return (
    <div className="body-shell">
      <div className="handoff-panel">
        <div className="handoff-panel__header">
          <HandStopIcon />
          <h2 className="handoff-panel__title">Call paused — your decision</h2>
        </div>
        <p className="handoff-panel__reason">{reason}</p>
        <div className="handoff-options">
          {options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={`handoff-option ${index === options.length - 1 ? "handoff-option--primary" : "handoff-option--secondary"}`}
              onClick={() => onChoose(option)}
              disabled={choosing}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DoneBody({ outcome, terminalOnly, onShowClosing }) {
  if (terminalOnly || !outcome) {
    return (
      <div className="body-shell">
        <div className="body-panel body-panel--plain">
          <p className="terminal-message">The call has wrapped up. Tessera will follow up if needed.</p>
          <div className="terminal-actions">
            <ShowClosingButton onClick={onShowClosing} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="body-shell">
      <div className="body-panel body-panel--plain">
        <div className="outcome-panel__header">
          <CheckIcon />
          <h2 className="outcome-panel__title">{formatOutcomeTitle(outcome.status)}</h2>
        </div>
        <table className="outcome-table">
          <tbody>
            <tr>
              <td>Result</td>
              <td>{outcome.summary}</td>
            </tr>
            <tr>
              <td>Next step</td>
              <td>{outcome.next_steps}</td>
            </tr>
            <tr>
              <td>Reference</td>
              <td className="outcome-table__mono">{outcome.reference_number}</td>
            </tr>
            <tr>
              <td>If no reply</td>
              <td>Tessera calls back Thursday</td>
            </tr>
          </tbody>
        </table>
        <div className="outcome-actions">
          <ShowClosingButton onClick={onShowClosing} />
        </div>
      </div>
    </div>
  );
}

export default function PatientAdvocatePage() {
  const {
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
  } = useCallSession();

  const [showClosing, setShowClosing] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    if (phase !== "calling") {
      setCallSeconds(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div className="app">
      <p className="sr-only">
        Tessera patient-side voice advocate across four states: pre-call claim form, active call
        transcript, patient handoff decision, and outcome card.
      </p>

      {!showClosing && <ThesisBar />}

      {/* Single reused audio element — autoplay unlocked on Start click */}
      <audio ref={audioRef} preload="auto" playsInline className="sr-only" />

      {phase !== "idle" && claim && <ClaimHeader claim={claim} collapsed={headerCollapsed} />}

      <div className="status-row">
        <StatusPill state={pillState} />
        {phase === "calling" && <CallTimer seconds={callSeconds} />}
      </div>

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      {phase === "idle" && (
        <IdleBody
          claim={claim}
          onStart={() => startCall("live")}
          wsConfigured={wsConfigured}
          wsReady={wsReady}
        />
      )}
      {phase === "calling" && <CallingBody turns={turns} />}
      {phase === "handoff" && handoff && (
        <HandoffBody
          reason={handoff.reason}
          options={handoff.options}
          onChoose={chooseHandoffOption}
          choosing={choosing}
        />
      )}
      {phase === "done" && !showClosing && (
        <DoneBody
          outcome={outcome}
          terminalOnly={terminalOnly}
          onShowClosing={() => setShowClosing(true)}
        />
      )}
    </div>
  );
}
