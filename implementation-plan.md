# Patient-Side Voice Advocate — Implementation Plan

**Autonomous Healthcare Hackathon · June 13, 2026 · Solo build · Demo at 6:00 PM**

> ⏱️ **Re-planned at 11:33 AM.** Morning cushion is gone. The noon gate moved to **1:15 PM**. Strategy is unchanged; only the schedule compressed. The single biggest risk now is finishing with no narrative — so the three sentences get written in the next 10 minutes, before any code.

---

## The one-sentence thesis (memorize this)

> Providers and payers are arming themselves with voice agents. The patient is now the only party in the call without one. We built the agent that works for the patient.

Everything below serves that sentence. When a decision is unclear, pick the option that makes the thesis *more visible in the demo*, not the one that's technically cleaner.

---

## FIRST — 11:33–11:43 (write before you touch code)

If you dive into code now you won't resurface, and at 11:33 the real risk is finishing the build with no story. These three sentences survive even a total build failure. Write them in 10 minutes, no polish.

1. **The open (≤20 words):** the empty-seat thesis, said cold. Your 0:00–0:15.
2. **The close (≤20 words):** what the judges should feel after the outcome card appears.
3. **The "does this exist?" rebuttal (≤15 seconds spoken):** the alignment reframe — Operator Labs and the rest sit on the *provider/payer* side; the novelty here is *whose interests the agent is structurally aligned with*, not the voice tech. Your most likely hard Q&A question. Make it a reflex.

Set a timer for 11:43. When it goes off, the sentences are done and you start Phase 0.

---

## What decides this (and what doesn't)

You are a solo competitor whose edge is a **thesis**, not novel telephony. The crowded, funded field already ships the *capability*. Judges will not score your WebSocket orchestration. They will score whether 90 seconds made them *feel* the asymmetry.

**Therefore the narrative is the product, not a 4 PM garnish.** This plan deliberately protects a full hour for nothing but the open, the close, and the handoff beat. Resist the instinct to spend that hour on one more feature.

**The handoff is the centerpiece, not a cut-candidate.** It is the only moment the patient has agency. Make it a real *decision* ("the insurer's offering a partial resolution — accept, or push for full?"), never a data-entry field. If the patient is just a spectator watching a bot work on their behalf, a sharp judge asks "so is the patient more *autonomous*, or just better *served*?" — and that question loses the room.

---

## Architecture (locked)

- **One patient-facing screen** (Next.js on Vercel).
- **Two sealed Grok realtime sessions** — advocate + clinic — on a **server orchestrator**.
- **Orchestrator runs locally on the demo laptop**, same machine as the browser. Do NOT deploy it to the cloud; that puts conference wifi in the audio hot path. The UI can be remote; the audio loop stays local (localhost).
- **No browser mic in the bot-to-bot loop.** Browser mic/decision UI appears only at the handoff.
- **Turn detection OFF on both sessions.** The orchestrator owns turn-taking via `response.done` → relay → `response.create`. This eliminates dual-VAD chaos and self-triggering feedback by construction.

**Mental model:** *the server owns the adversarial call; the browser owns the patient's moment.* Two reliability regimes for two purposes — and that split is itself expressive of the product.

---

## The non-negotiable gate

**If the headless turn-loop spike is not clean by 12:00 noon, stop and switch to the fallback path.** No UI, no Vercel, no patient context until the loop works. This is the single most important rule in the plan.

---

## Build order (compressed from 11:33)

Lunch (Sweetgreen) lands at 12 — eat one-handed while the spike runs. Don't stop the clock.

### Phase 0 — Verify API assumptions FIRST (11:43–12:00)

Before any orchestration logic, confirm against the live xAI docs at check-in:
- The actual realtime model string (don't trust `grok-voice-think-fast-1.0` from memory)
- That `turn_detection: null` / manual `response.create` is supported
- Voice names, the WebSocket URL, event names (`response.done`, `conversation.item.create`, `input_audio_buffer.commit`)
- Function-tool calling over the realtime socket

Discover a wrong assumption now, not at 2 PM. Claim your $100 xAI credit if you haven't.

### Phase 1 — Prove the engine (12:00–1:45) — NON-NEGOTIABLE

| Time | Task | Done when |
|---|---|---|
| 12:00–1:15 | Headless Node script: 2 Grok WS sessions, VAD off, manual turns, hardcoded advocate opening, relay on `response.done`, cap 4 exchanges, log transcripts + save WAVs. **Build the cache/replay path in the same pass** — write every turn to disk, add a "replay last good run" mode. | 4 clean alternations, no overlap, no hang, < 90s — AND a cached run replays identically |
| 1:15–1:45 | Inject synthetic patient context into advocate `instructions`; clinic prompt with 2 *conditional* curveballs; add tools `request_patient_input({reason, options})` + `complete_call({status, summary, next_steps, reference_number})` | Clinic throws an unprompted obstacle; handoff pauses loop; outcome JSON returns |

> **HARD GATE — 1:15.** If the dual-Grok-voice loop isn't clean by 1:15, immediately drop the clinic side to text→TTS or keyword-triggered scripted curveballs and move on. The advocate stays full Grok voice — that's the prize and the thesis. **Do not debug dual sessions past 1:15.** You've spent 75 minutes; that's the budget.

> The cache/replay path is your nuclear fallback and it's nearly free — the server already sees every `response.done`. Build it inside the spike, verify it works at 3:45, not 5:55.

### Phase 2 — Patient UI (1:45–3:45)

| Time | Task |
|---|---|
| 1:45–3:00 | Next.js on Vercel: synthetic claim form, "Start call" button, live transcript (advocate prominent, insurer muted), advocate audio playback via orchestrator ↔ browser WS |
| 3:00–3:45 | **Handoff decision UI** (centerpiece) — call visibly pauses, screen presents a real choice (Accept partial / Push for full), choice injects back into the advocate session, call resumes. Then the outcome card from `complete_call`. |

### Phase 3 — Win the room (3:45–6:00) — protect this time

| Time | Task |
|---|---|
| 3:45–4:30 | 5× end-to-end dry runs; prompt brevity tuning (max 2 sentences/turn; optionally `audio.output.speed: 1.1` on clinic). **Confirm cached replay works.** |
| 4:30–4:50 | **Read the actual judging rubric** (portal live 4 PM). Reweight whatever's left to match what they actually score. |
| 4:50–5:30 | **Narrative rehearsal — protected.** Open, close, handoff beat, "whose side" rebuttal. Time to 3:00. Pre-fill the form. Don't let build bleed in. |
| 5:30–6:00 | Submit: public repo, Vercel URL, pitch, names. Buffer: backup hotspot, cached run verified. **6:00 sharp.** |

---

## Cut list (if behind by ~3 PM, cut in this order)

1. Clinic *audio* to the room → transcript only (keep clinic Grok session server-side)
2. Live curveballs → 2 keyword-keyed conditional branches (still Grok)
3. Second denial scenario → one scenario only
4. Vercel deploy polish → run UI locally
5. **Nuclear fallback:** replay the cached run through the live UI; lose live-adaptation points but keep the whole story

**Never cut:** advocate Grok voice · patient context injection · visible transcript · **the handoff *decision*** · structured outcome card.

> The handoff is OFF the cut list and ON "never cut." It is the autonomy claim made visible. Browser-mic for the handoff can degrade to a click-choice, but the *decision itself* stays.

---

## 3-minute demo script

| Time | Beat | What's on screen / said |
|---|---|---|
| 0:00–0:15 | **The open** | Your memorized sentence. Pre-filled denied-claim form visible. "Watch our advocate make the call." Hit Start. |
| 0:15–1:45 | **The adversarial call** | Live. Transcript scrolls. Room hears the advocate's voice. Insurer denies, throws a curveball. Advocate pushes back using the patient's context. |
| 1:45–2:30 | **The handoff (centerpiece)** | Call pauses. Screen turns to the patient: "Insurer offers partial resolution — accept or push for full?" *You decide, live.* Advocate resumes on your choice. |
| 2:30–3:00 | **The close** | Outcome card: status, next steps, reference #. Your memorized closing line. Land the thesis. |

Pre-empt the credibility question inside the demo: the outcome is a `partial_resolution`, not a clean win, and you *name* that limitation yourself. Real insurers don't fold to a bot — saying so first reads as honesty and disarms the skeptic.

---

## Submission checklist (due 6:00 PM sharp)

- [ ] Team name + your name & email
- [ ] One-line pitch (≤140 chars) — drafted below, tune it
- [ ] Live URL on Vercel
- [ ] Public GitHub repo (remember: all code written *during* the event — they audit timestamps)
- [ ] Synthetic data only

**Pitch draft (≤140 chars):**
> *The patient is the only party on the call without an AI agent. We built theirs — a Grok-voice advocate that fights your denied claim, live.*

(132 chars. Tune in the 11:33–11:43 block.)

---

## Risk summary

| Risk | Mitigation |
|---|---|
| Turn-loop instability | Spike first, gate at noon, VAD off, server-owned turns |
| Live call hangs at demo | Cached replay through same UI (built at 10:30) |
| Conference wifi in audio path | Orchestrator runs local on demo laptop |
| "Does this exist?" Q&A | Rehearsed 15-sec alignment rebuttal |
| "You scripted the win" | Partial outcome + name the limitation yourself |
| Narrative under-baked | Full protected hour (4:30–5:30) for nothing but the story |
| Demo reads as bot-serving, not patient-empowering | Handoff = real decision, promoted to centerpiece |

---

*Spike first. Narrative wins. The handoff is the whole point.*