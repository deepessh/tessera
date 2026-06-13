# Tessera — Polish Plan (3:00 PM → demo)

**Projected demo · solo · submit before 4:30 · hard freeze 4:50**

> The build is "almost done." Polish is now upside — but only if it can't sink you. The whole trick: **freeze first, re-deploy after every step, submit off a frozen build, stop cold at 4:50.** Done this way, you're never more than one `git checkout` from a working demo, and the 5:55 heart attack becomes structurally impossible.

---

## Step 0 — the floor (3:00–3:10) · NON-NEGOTIABLE

Before touching a single style:

1. Commit the working version.
2. Deploy to Vercel. Confirm the URL loads **in an incognito window.**
3. Tag it: `git tag demo-safe && git push --tags`.

This is your revert target. Every polish step below ends with a re-deploy so this floor keeps rising. If you skip Step 0, stop reading — nothing else is safe.

---

## Polish order — safest & highest-payoff first

Each row: do it, eyeball it from 15 ft, **re-deploy**, then next. If a row isn't clean by its end time, `git checkout demo-safe` for that piece and move on.

| Time | Polish | Risk | Bail if… |
|---|---|---|---|
| 3:10–3:35 | **Projection legibility** — bump font sizes, widen margins, darken text on teal/amber fills so it survives projector washout. Test on an actual external screen. | low (CSS) | it looks worse big |
| 3:35–4:00 | **Color & state clarity** — teal = advocate, gray = insurer, amber = your decision. Make "advocate speaking" pill obvious; make transitions crisp. | low (CSS) | not clean by 4:00 |
| 4:00–4:20 | **Transcript motion** — bubbles animate in + auto-scroll so the call reads alive. | med (live render path) | any scroll jank |
| 4:20–4:40 | **Closing screen + thesis bar** — see design. Big, legible, asymmetry stated once. | med (new component) | not clean by 4:40 → drop |
| 4:40–4:50 | **The handoff moment** — amber interrupt, two clear buttons, deliberate pause. Highest leverage. | med | revert handoff to `demo-safe` |

---

## Two rules that make the risk safe

**Submit before you freeze (by ~4:30).** Submission is NOT downstream of polish. The moment the portal's open and you've read the rubric, put your *current deployed URL* + public repo into the portal. If later polish breaks something, the submitted URL still points at a working build. Decouple "what I submit" from "what I'm tweaking."

**4:50 = hard freeze.** `git checkout` to last good deploy if anything is shaky. After 4:50 the build is done — good or bad. You rehearse what you have.

---

## Do NOT touch (not polish — new risk in disguise)

- The bot-to-bot turn loop / orchestrator. It works. Leave it.
- Real-phone anything.
- A second scenario.
- Animated phone-dialer chrome around the call. (Pulls attention to "look, a call" instead of "look, whose side.")

---

## Tessera design spec (for the polish)

**Name motif:** a tessera is one tile in a mosaic — each call is a tile; the patient's advocacy is the mosaic. Keep it light: a small 2×2 teal-tile mark by the wordmark. Don't over-build it.

**Color = whose side (load-bearing, reads at distance):**
- Teal (`#1D9E75` / fills `#E1F5EE`, deep `#04342C`) = the patient's advocate. Always.
- Gray (`#888780` / fill `#F1EFE8`) = the insurer. Always.
- Amber (`#BA7517` / fill `#FAEEDA`) = the patient's decision moment. Only here.

**Persistent thesis bar** (top, entire demo): deep-teal bar, `Tessera` wordmark + tile mark, then the line *"The patient is the only party on the call without an agent."* Replaces an intro slide.

**Live call:** advocate-speaking pill (teal dot + label), running timer, chat bubbles — advocate teal/left, insurer gray/right. Bubbles animate in, auto-scroll. Font ≥16px for projection.

**Handoff (centerpiece):** amber card, 3px amber border so it visually *interrupts* the calm teal call. "Call paused — your call to make." One plain button (accept) + one filled amber button (push). This is the autonomy beat — over-invest relative to its size.

**Outcome card:** white, check icon, partial-resolution result + reference #. Name the partial win — it pre-empts "you scripted this."

**Closing screen (Q&A backdrop):** deep-teal. Three tiles — Provider *has an agent* · Payer *has an agent* · **Patient now has one too** (the patient tile brightened to signal the fix). Wordmark + *"an agent on the patient's side."* Holds your strongest line on the projector through all of Q&A.

---

## Projector logistics — lock by 3:35

- Adapter: HDMI **and** USB-C on hand. The room may not have yours.
- Mirror/extend tested on a real external screen.
- Contrast under washout: projectors crush dark-on-dark and light-on-light. Darken text on colored fills if muddy.
- Browser zoom set for the room; tab chrome hidden / full-screen.

---

## 5:00–6:00 — rehearsal (protected regardless of polish)

A beautiful demo run zero times loses to a plain one run eight times. You are most of what the judges experience.

- Out loud, standing, to the projected screen.
- The arc: open (thesis) → live run → **handoff beat** → outcome (name the partial win) → closing screen.
- The 15-sec **"does this exist?"** rebuttal until reflex: the field sits on the *provider/payer* side; Tessera's novelty is *whose side the agent is on*.
- Time to 3:00. Have the cached replay cued as the live-failure fallback.

---

*Freeze first. Submit early. Stop at 4:50. The handoff is the whole point.*