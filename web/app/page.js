"use client";

import { useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_ORCH_WS_URL ?? "";

/** Synthetic demo claim — overwritten by server `claim` message in item 4. */
const SAMPLE_CLAIM = {
  claimNumber: "CLM-2026-88421",
  service: "MRI lumbar spine without contrast",
  claimAmount: "$1,840",
  goal: "Overturn denial",
  denialCode: "CO-50",
};

/** @typedef {"idle" | "calling" | "handoff" | "done"} Phase */
/** @typedef {"idle" | "connecting" | "advocate" | "insurer" | "paused" | "done"} PillState */

/**
 * @typedef {Object} Claim
 * @property {string} claimNumber
 * @property {string} service
 * @property {string} claimAmount
 * @property {string} goal
 * @property {string} denialCode
 * @property {string} [denialReason]
 */

/**
 * @typedef {Object} TranscriptTurn
 * @property {"advocate" | "clinic"} role
 * @property {string} text
 */

/**
 * @typedef {Object} HandoffOption
 * @property {string} id
 * @property {string} label
 */

/**
 * @typedef {Object} Outcome
 * @property {string} status
 * @property {string} summary
 * @property {string} next_steps
 * @property {string} reference_number
 */

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function formatDenialBadge(code) {
  return `${code} denied`;
}

function formatOutcomeTitle(status) {
  const labels = {
    approved: "Claim approved",
    partial_resolution: "Partial resolution",
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
      label = "Advocate speaking";
      break;
    case "insurer":
      label = "Insurer reviewing…";
      break;
    case "paused":
      dotClass = "status-pill__dot--paused";
      labelClass = "status-pill__label--paused";
      label = "Call paused — your decision";
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

function IdleBody({ claim, onStart, wsConfigured }) {
  return (
    <div className="body-shell">
      <div className="start-card">
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
        <button
          type="button"
          className="start-button"
          onClick={onStart}
          disabled={!wsConfigured}
        >
          <PhoneIcon />
          Start the call
        </button>
        {!wsConfigured && (
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 10, marginBottom: 0 }}>
            Set NEXT_PUBLIC_ORCH_WS_URL in web/.env.local
          </p>
        )}
      </div>
    </div>
  );
}

function CallingBody({ turns }) {
  return (
    <div className="body-shell">
      <div className="body-panel">
        <div className="transcript" role="log" aria-live="polite" aria-relevant="additions">
          {turns.length === 0 ? (
            <p className="transcript-empty">Waiting for the advocate to connect…</p>
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

function DoneBody({ outcome, terminalOnly }) {
  if (terminalOnly || !outcome) {
    return (
      <div className="body-shell">
        <div className="body-panel body-panel--plain">
          <p className="terminal-message">The call has wrapped up. Your advocate will follow up if needed.</p>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PatientAdvocatePage() {
  /** @type {[Phase, Function]} */
  const [phase, setPhase] = useState("idle");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  /** @type {[PillState, Function]} */
  const [pillState, setPillState] = useState("idle");

  /** @type {[Claim, Function]} */
  const [claim, setClaim] = useState(SAMPLE_CLAIM);
  /** @type {[TranscriptTurn[], Function]} */
  const [turns, setTurns] = useState([]);
  const [handoff, setHandoff] = useState(
    /** @type {{ reason: string, options: HandoffOption[] } | null} */ (null)
  );
  const [outcome, setOutcome] = useState(/** @type {Outcome | null} */ (null));
  const [terminalOnly, setTerminalOnly] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const wsConfigured = Boolean(WS_URL);

  const displayClaim = claim;

  function handleStart() {
    if (!wsConfigured) return;
    setHeaderCollapsed(true);
    setPhase("calling");
    setPillState("connecting");
    setTurns([]);
    setHandoff(null);
    setOutcome(null);
    setTerminalOnly(false);
    // WS connect + start {mode:"live"} wired in Phase 2.1 item 4
  }

  function handleHandoffChoose(option) {
    setChoosing(true);
    // decision {choice,label,note} wired in Phase 2.1 item 4
    void option;
  }

  return (
    <div className="app">
      <h1 className="app-title">Patient advocate</h1>
      <p className="sr-only">
        Patient advocate UI across four states: pre-call claim form, active call transcript, patient
        handoff decision, and outcome card.
      </p>

      {phase !== "idle" && <ClaimHeader claim={displayClaim} collapsed={headerCollapsed} />}

      <StatusPill state={pillState} />

      {phase === "idle" && (
        <IdleBody claim={displayClaim} onStart={handleStart} wsConfigured={wsConfigured} />
      )}
      {phase === "calling" && <CallingBody turns={turns} />}
      {phase === "handoff" && handoff && (
        <HandoffBody
          reason={handoff.reason}
          options={handoff.options}
          onChoose={handleHandoffChoose}
          choosing={choosing}
        />
      )}
      {phase === "done" && <DoneBody outcome={outcome} terminalOnly={terminalOnly} />}
    </div>
  );
}
