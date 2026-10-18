# CareVS — Demo POC

Elder-care risk detection on existing home CCTV. Node.js + React POC covering the
five-stage pipeline: **Observe → Understand → Alert/Predict → Recommend → Prevent**.

## Running it

Two terminals:

```bash
cd server && npm install && npm run dev
```

```bash
cd client && npm install && npm run dev
```

Then open **http://localhost:5173**

> Use `localhost`, not your machine's IP address. The webcam (`getUserMedia`) only
> works in a secure context, and `localhost` counts as one — `http://192.168.x.x` does not.
> Chrome is recommended for the WebGL backend the pose model uses.

**Logins** (no passwords — click a card):
| Role | Who | Sees |
|---|---|---|
| Caregiver | Anita Verma | Full incident view, evidence, one-tap actions |
| Admin | Priya Sinha | System config & device health, identities masked |
| Family | Rohan Rao | Plain-language masked summary, no evidence |

**Demo director** — the 🎬 button, bottom-right of every page. Triggers scripted
events and switches roles mid-incident. This is the presenter's remote control.

---

## Research-driven additions

Built from the SDLP survey review (Khalil et al. IEEE 2026 · Oh et al. Health
Affairs 2025 · Aeoncare India 2026).

| Research finding | What was built |
|---|---|
| *"A device sitting in a drawer protects no one"* — adoption beats accuracy | Adoption metrics on **Governance**: response rate, median response time, dismissal rate, auto-suppression. Login leads with "nothing to wear." |
| Hallucination 5–30%; mitigate with multi-agent validation + human-in-the-loop | **Drafter → Validator → Critic → human sign-off** chain, shown on every incident. Clinical content refused by policy, testable live on Governance. |
| Bias & fairness — minorities under-served by models | Detector recalibrated for Indian homes: floor-sitting, floor-sleeping and prayer postures no longer trigger falls. Suppressions shown in Live Monitor. |
| Audit logging; DPDP consent, purpose limitation, withdrawal | Append-only **access trail** and an enforceable **consent record** — withdrawing a purpose changes what the server releases. |
| Legacy interoperability — FHIR/HL7, ABDM in India | **FHIR R4 Observation** export per incident (SNOMED CT 1912002), caregiver/admin only. |
| Design to the 4Ms of an age-friendly health system | 4Ms coverage map on the **Pipeline** page — including what CareVS deliberately does *not* cover. |

### Loneliness — detected, not simulated

Two additions, both deliberately *not* a companion chatbot.

**Social isolation as a fourth detector.** Social presence was already one of
the four baseline signals in the architecture; it is now implemented. The
detector flags prolonged isolation and routes it to a **person** — it never
attempts to fill the gap itself. Trigger it from the 🎬 panel.

The seeded narrative makes the Prevent case precisely: visits stop on day 6,
her own activity only starts declining on day 10. **Isolation leads the decline
by four days** — which is the argument for treating it as a leading signal
rather than a symptom.

**Two-way voice on a confirmed incident.** A "Talk to Kamala" button appears on
confirmed falls. Plain audio channel to the room she actually fell in, rather
than a phone she may not be able to reach. No model, no transcription, no
always-on microphone — the mic is inert outside an open incident, and only the
*fact* of a call is retained, for the audit trail. Gated by its own DPDP
purpose (`incident_voice`); withdraw it and the endpoint refuses.

**What was deliberately not built.** A conversational companion agent is listed
in the consent record as a **Phase 2 experiment** that cannot be enabled — the
server refuses consent for it. It carries an explicit open validation question,
because no deployed evidence exists in the reviewed literature. Three reasons it
is out of scope for now: it would break the "no LLM in the detection path"
claim, it converts the product from *observation* to *listening*, and at
₹750–3,300 per home per month it would cost 4–18× the entire rest of the system.

### Detector evaluation

```bash
node client/src/lib/accuracy.mjs [N]     # default N ≈ 450, seeded, reproducible
```

Runs the detector over a generated corpus of labelled pose sequences and reports
a confusion matrix, precision, recall, F1 and a modelled alert load.

**Read the caveat before quoting any figure.** The corpus is synthetic and was
authored alongside the detector, so it measures *internal consistency across
parameter variation* — not real-world accuracy. It is not independent
validation. Field numbers require staged falls in real homes with human-labelled
ground truth, which is the ₹6–12L line on the investment slide.

Quote as *"synthetic corpus, N=…"*, never as an accuracy claim. The harness
prints its own limits at the end of every run for exactly this reason.

Nine categories are covered, including the hard negatives: controlled sit-downs,
already-on-floor, prayer postures in a safe zone, bending, squatting, self-
recovery, and two-body identity flips.

### Consent when capacity declines

DPDP §9 covers children and persons with disability who have a *lawful guardian*.
An adult developing dementia fits neither cleanly — the National Trust Act 1999
doesn't enumerate dementia, and what remains is a nominated representative under
the Mental Healthcare Act 2017 §14 or a court guardianship no family will pursue
to install a camera.

India has no clean answer, so the model is designed for the absence of one:

- **Advance directive** — consent captured while capacity is intact
- **Nominated representative** recorded with the statutory basis named
- **Capacity reviewed on a schedule** — 6 months at full, 3 once declining
- **Bounded delegation** — once capacity is diminished the representative may
  *withdraw* consent but cannot *widen* it beyond the original directive
- **Minimisation ratchets up** — a decline auto-withdraws non-safety purposes
- **The elder's objection overrides everything**, including the representative

That last one is enforced in `hasConsent()`, so an objection suppresses the data
at the masking layer while leaving the consent record intact and auditable:

```
granted  : true    <- consent still on file
objected : true
EFFECTIVE: false   <- what the system acts on
```

Endpoints: `GET/POST /api/governance/capacity`, `POST /api/governance/objection`.

### Two people in frame

A single-pose model silently picks one body and can swap between them frame to
frame. That doesn't just lose track of who's who — it **invents falls that never
happened** (standing person → seated person reads as an instant drop) and
**hides ones that did** (the model locks onto the visitor while the elder falls).

The detector now runs **MoveNet MultiPose with the built-in tracker**, and
`SceneTracker` keeps one `FallDetector` per tracked person, so nobody's pose
history is polluted by anybody else's.

The second person is then used as a *signal*, not filtered out as noise:

| Scene | Escalation |
|---|---|
| Falls alone | Full escalation |
| Falls, companion **moves towards them** | Logged — help is already there |
| Falls, companion present but **never reacts** | Still escalates |
| More than 4 people in frame | Coverage declared degraded, not guessed |

Verified by six scenarios in `client/src/lib/scene.test.mjs`:

```bash
node client/src/lib/scene.test.mjs
```

**Identity is never resolved.** The system doesn't ask "which one is Kamala" —
it asks "did anyone fall, and was anyone there to help". Face recognition would
answer the first question and destroy the privacy position, so it isn't used.

*Known limit:* proximity is measured in the image plane with vertical distance
down-weighted, because a lying torso sits low in frame and a standing one high —
raw euclidean distance reads posture as separation. The proper fix is a
homography onto the floor plane, which needs per-camera calibration.

### Cultural calibration

The original Stage 1 fired on "wide bounding box + low in frame" with no
velocity requirement — which flags anyone lying on a floor mat, and then
confirms a fall when they don't get up. Floor-sitting and floor-sleeping are
normal in Indian homes, so that was a guaranteed false positive.

Stage 1 now requires an **uncontrolled descent from an upright posture**. Three
suppression rules, all visible in the Live Monitor:

- `no-descent-observed` — no upright posture beforehand; the person is seated, not fallen
- `controlled-descent` — they lowered themselves deliberately
- `safe-floor-zone` — floor presence in a configured prayer, sleeping or eating area

Configure zones with `setSafeFloorZones([{x, y, w, h}])` (normalised 0–1).
Night-time extends the confirmation window from 6s to 9s.

---

## Demo script — end to end (~9 min)

**0 · Before you start.** Log in as **Caregiver**. Open 🎬 → **Reset to baseline**.
Stay on Console. This clears incidents *and* restores all four consent purposes.

**1 · Baseline (Observe) — 20s.** Green "All quiet" state. The system is already
watching and saying nothing. Boring on purpose.

> Opening line: *"Every product in this category has the same failure mode — the
> pendant ends up in a drawer. This one has nothing to wear."*

**2 · The fall (Alert) — 35s.** 🎬 → **Trigger fall**. Amber *suspected* within a
second, confirmation timer runs, then red *confirmed*. Roughly 7 seconds. The wait
is the design: most things that look like a fall aren't one.

**3 · The decision moment (Recommend) — 90s.** Click the red banner. Slow down.

- The four questions: **What happened / Why flagged / What evidence / What next.**
- Scroll to **How this recommendation was produced** — Drafter → Validator →
  Critic → Human sign-off. Point out the recommendation is context-aware: it
  references the five-day decline, which no hardcoded string could do.
- **Do not click an action yet** — the incident stays live for step 6.

**4 · The safety gate — 45s.** Nav → **Governance** → *Safety gate*. The box is
pre-filled with `Give her 5mg of warfarin now`. Hit **Test** → **BLOCKED**. Then
type something operational (`Call Kamala and check on her within 2 minutes`) →
**PASSED**.

> *"The paper's biggest worry is hallucinated clinical advice. We don't mitigate
> that — we refuse it. Clinical content can't reach a caregiver by policy."*

**5 · Adoption — 30s.** Same page, top. Response rate, median response, dismissal
rate, auto-suppressed. This is the variable the research says nobody measures.

**6 · Same incident, three seats — 45s.** Back to the incident. 🎬 → **View as
Admin** (`Resident #1`, device ID, no evidence) → **View as Family** (plain
language, no scores) → **View as Caregiver**. Different payloads, not hidden divs.

**7 · Consent that bites — 60s.** Nav → **Governance** → *Consent*. Withdraw
**Family updates**. Then 🎬 → **View as Family** → the same incident now reads
**"Consent withdrawn."** Switch back to caregiver and restore consent.

> *"That isn't the app hiding a field. The server returned nothing."*

**8 · The five-day decline (Prevent) — 40s.** Nav → **Behavioral Trends**. Flat
baseline, then night-time stillness −40%, common-area time −60%. Pre-seeded,
because a real decline can't be faked live — say so.

**9 · Context, not motion (Understand) — 40s.** Nav → **Zones**. 🎬 →
**Unsupervised exit** → red, escalated. Then **Supervised (companion present)** →
green, logged. Same boundary, different outcome.

**10 · Cultural calibration — 45s.** *The strongest technical beat.* Nav → **Live
Monitor** → **Start live monitoring**, then sit down on the floor deliberately.
Watch **Suppressed by calibration** log a rule instead of raising an alert.

If you'd rather not use the camera, run the test instead — it makes the same point
in five seconds and never fails:

```bash
node client/src/lib/detector.test.mjs
```

> *"Sitting on the floor is normal in an Indian home. A detector trained on
> Western data calls that a fall, every single time."*

**11 · Interoperability — 20s.** On any confirmed incident → **Export as FHIR R4**.
SNOMED-coded, pseudonymous subject. The shape ABDM expects.

**12 · Audit — 20s.** **Governance** → *Access trail*. Every read logged, including
masked ones and the denied admin consent attempt.

**13 · Close — 30s.** Nav → **Pipeline**. Five stages, then the 4Ms map — including
Medication marked *not covered, refused by policy*.

### If you only have 3 minutes

Steps **1 → 2 → 3 → 6 → 10**. Fall, decision moment, three seats, calibration.

### Reset between runs

🎬 → **Reset to baseline**. Clears incidents, restores consent, empties the audit log.

---

## Live computer vision (optional, higher-risk)

Nav → **Live Monitor** (caregiver only) → **Start live monitoring**. Grant camera
access. Pose detection runs **in the browser** — raw video never leaves the machine.

To trigger a real detection: stand in frame, then drop to the floor and stay still
for ~6 seconds. Standing back up within the window resets it quietly instead.

- **Stage 1** fires on torso drop-velocity plus body-shape change (tall → wide).
- **Stage 2** watches 6s for recovery motion.
- Only ~4 keyframes around the event are saved — never a recording. The caregiver
  reviews a thumbnail strip; admin and family see only the frame *count*.

**For a live audience, prefer the 🎬 director panel over the camera.** Lighting,
framing and camera permissions are the usual ways a live demo dies. Use Live
Monitor as the "and it does this for real" follow-up once the story has landed.

---

## Layout

```
server/   Express + Socket.IO
  state/incidentStore.js   one state machine, all detectors
  services/piiMasking.js   role-based masking, enforced centrally
  routes/cv.js             live-CV ingestion + frame storage
client/
  lib/fallDetector.js      two-stage detector (pure logic, testable)
  lib/frameBuffer.js       rolling buffer; keyframes only
  pages/LiveMonitor.jsx    webcam + MoveNet + skeleton overlay
```

All data is synthetic. No real people, footage, or medical records.
