# Implementation Plan: MVP-1.5 Interaction Calibration

## Overview

Deliver the accepted interaction-calibration design in thin, test-first increments. Public contracts are established first; each behavioral slice is reviewed for spec compliance and code quality before the next slice begins.

## Architecture Decisions

- Keep selfie-mirrored preview and make interaction mirroring explicit.
- Use canonical timestamped `HandFrame` values across runtime and replay.
- Keep third-party filtering behind an Auaka-owned interface.
- Store calibration as a versioned validated profile.
- Require automated replay plus real-camera smoke verification.

## Task List

### Task 1: Canonical hand-frame and coordinate contracts

**Description:** Introduce canonical tracker output and explicit raw-to-mirrored-to-viewport coordinate conversion without changing gesture behavior beyond the approved direction fix.

**Acceptance criteria:**
- Tests first demonstrate correct nine-point mirrored mapping and NDC conversion.
- Hand frames carry timestamp, dimensions, handedness, confidence, and landmarks.
- Existing landmark overlay remains aligned with the mirrored preview.

**Verification:** targeted Vitest tests, full frontend tests, typecheck, production build.

**Dependencies:** None.

**Likely files:** tracker/types, coordinate mapper, tracker tests, mapper tests.

### Task 2: Versioned calibration profile

**Description:** Add a checked-in v1 profile, strict validation, and safe fallback used by interaction components.

**Acceptance criteria:**
- Tests first reject malformed/out-of-range profiles and accept v1 defaults.
- Runtime parameters are loaded from one immutable typed profile.
- Loading failure does not break mouse mode or camera shutdown.

**Verification:** targeted tests, full frontend tests, typecheck, build.

**Dependencies:** Task 1.

### Task 3: Visible filtered pointer

**Description:** Add One Euro filtering, deadzone, a visible pointer/hit ring, and explicit pointer state feedback.

**Acceptance criteria:**
- Tests first cover timestamp-aware filtering, reset/dropout, cursor visibility, and hover state.
- Physical rightward motion moves the pointer right.
- Pointer is hidden on invalid/no-hand frames and mouse fallback remains intact.

**Verification:** targeted tests, replay fixture, full tests, typecheck, build, browser smoke test.

**Dependencies:** Tasks 1–2.

### Task 4: Palm-normalized pinch state machine

**Description:** Replace fixed threshold/frame counting with normalized, hysteretic, time-based pinch selection.

**Acceptance criteria:**
- Tests first cover scale variation, threshold jitter, one-event semantics, release/cooldown, and dropout cancellation.
- Empty-space pinch has no selection side effect.
- Pinch visual states are reflected by the pointer presenter.

**Verification:** targeted tests, replay fixtures, full tests, typecheck, build.

**Dependencies:** Tasks 1–3.

### Task 5: Open Palm and two-hand baseline transforms

**Description:** Make Open Palm orientation-tolerant and replace per-frame two-hand deltas with baseline-relative bounded commands.

**Acceptance criteria:**
- Tests first cover stable entry, neutral hold, FPS invariance, angle unwrap, dropout/re-baseline, reorder/crossing pause, and mode priority.
- Two arbitrary hands emit no transform; two open palms held for 200 ms activate transforms.
- Zoom uses OrbitControls dolly and rotation uses horizontal camera orbit.
- Open Palm clears selection and collapses the detail panel exactly once without changing camera state.
- Two-hand zoom and rotation never jump beyond configured limits.

**Verification:** targeted tests, replay fixtures, full tests, typecheck, build.

**Dependencies:** Tasks 1–4.

### Task 6: Trace replay and metrics

**Description:** Add a versioned trace schema, replay harness, metric calculations, and non-sensitive fixtures.

**Acceptance criteria:**
- Tests first validate trace schema and deterministic replay.
- Metrics calculate jitter, latency proxy, event counts, drift, and transform differences.
- Sensitive real recordings remain gitignored by default.

**Verification:** replay test command, full tests, typecheck, build.

**Dependencies:** Tasks 1–5.

### Task 7: Integrated UI and release verification

**Description:** Integrate compact gesture status, preserve manual/automatic camera exit, update documentation, and run release gates.

**Acceptance criteria:**
- UI exposes Mouse, Pointer, Pinch, Open Palm, Two Hand, and No Hand states unobtrusively.
- The preview remains selfie-mirrored in the upper-left, with its landmark overlay aligned.
- Manual close while tracking immediately stops tracks and returns to mouse mode.
- Exactly 15,000 ms without a valid hand invokes the same shutdown path once; hand recovery resets the timer.
- Existing knowledge-space interactions and mouse mode regressions are absent.
- Automated gates pass and required human-camera results are recorded; placeholders do not satisfy release gates.

**Verification:** full frontend tests, typecheck, build, browser test, manual camera runbook.

**Dependencies:** Tasks 1–6.

## Checkpoints

- After Task 2: contracts/profile review.
- After Task 4: one-hand interaction browser check.
- After Task 6: deterministic replay and metrics review.
- After Task 7: final spec review, quality review, and release decision.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Camera-dependent tuning becomes subjective | Trace replay and explicit metrics before parameter changes |
| Mirroring fixes overlay but breaks scene input | Separate display and interaction coordinate tests |
| Third-party filter creates coupling | Small Auaka interface, pinned attribution, local tests |
| Hand identity changes cause transform jumps | Prefer handedness, pause ambiguity, re-baseline after dropout |
| Real camera cannot be fully automated | Browser/runtime smoke checks plus explicit human acceptance checklist |
