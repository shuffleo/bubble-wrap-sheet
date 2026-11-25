# Survival Run implementation scaffold

This plan implements `docs/ROGUELIKE-GDD.md` without coupling game rules to WebGL rendering. Each milestone leaves Free Pop functional and adds independently testable game behavior.

## Architecture principles

1. Keep `BubbleEngine` responsible for rendering, physical input, hit testing, and bubble state.
2. Put encounter, score, timer, shop, hazard, and upgrade rules in pure TypeScript modules.
3. Represent every resolved bubble action as a typed event with an explicit source.
4. Use seeded randomness for shops, hazards, Drunken Bob, and assisted targets.
5. Make game time pausable and independent from `AudioContext.currentTime`.
6. Keep Free Pop as the default compatibility path until Game mode is explicitly selected.
7. Add behavior behind stable APIs; do not reach into engine private fields from the game layer.

## Engine decision

Use the existing `BubbleEngine` plus a custom, headless game-rules layer for the MVP. Do not add a general-purpose game engine, ECS, physics engine, or external state-machine runtime yet.

Reasons:

- `BubbleEngine` already owns the specialized WebGL renderer, instancing, bubble physics, moving hit tests, keyboard groups, multi-touch, audio, haptics, and mobile recovery.
- Phaser or another complete engine would add a second scene graph, frame loop, input system, loader, and lifecycle around systems that already work.
- A renderer-only library such as PixiJS would replace custom rendering without helping shops, scoring, hazards, or run flow.
- An ECS such as bitECS is optimized for larger heterogeneous entity sets; the current typed arrays already provide data-oriented bubble storage.
- XState or a small headless framework could model phases, but the planned phase graph is small enough for a typed pure reducer.
- Pure TypeScript modules can already run headlessly in Node tests without a framework.

Reconsider this decision only if profiling or scope demonstrates one of these needs:

- Several distinct game worlds with reusable entity composition.
- Replay/rewind or deterministic lockstep.
- Networked simulation.
- Complex nested/parallel statecharts that make the reducer difficult to verify.
- A second renderer or platform backend.

The game layer still behaves like a headless engine: it accepts typed events plus elapsed game time, returns state/effects, never reads the DOM, and never owns rendering.

## Proposed source scaffold

```text
config/
  level-design.json
  level-design.schema.json
src/
  game/
    game-types.ts
    game-config.ts
    game-clock.ts
    game-rng.ts
    game-reducer.ts
    game-controller.ts
    scoring.ts
    calibration.ts
    shops.ts
    upgrades.ts
    hazards.ts
    conveyor.ts
    persistence.ts
    game-ui.ts
    generated/
      level-design-config.ts
scripts/
  validate-game-config.mjs
  game-dev.mjs
tests/
  game/
    config.test.cjs
    game-reducer.test.cjs
    scoring.test.cjs
    calibration.test.cjs
    shops.test.cjs
    upgrades.test.cjs
    hazards.test.cjs
    conveyor.test.cjs
    persistence.test.cjs
```

Browser regressions remain under `tests/` and gain focused run-flow scripts as milestones land.

## Live balance configuration

`config/level-design.json` is the human-editable source of truth. It already contains all agreed sizes, level counts, scoring values, calibration bounds, prices, upgrade parameters, hazard parameters, conveyor values, and UI timings.

Implementation requirements:

1. Add `level-design.schema.json` with bounds, required keys, and enums.
2. Validate the JSON before TypeScript compilation and report exact failing property paths.
3. Generate `src/game/generated/level-design-config.ts`; never hand-edit that file.
4. Import numeric game balance only from the generated config.
5. Production builds embed the validated config so deployment and standalone HTML remain offline-safe.
6. Add `npm run game:dev` to watch source and JSON changes, rebuild, and reload the current local page.
7. Add a development-only Tuning Drawer at `?game=1&tuning=show`.
8. Generate the drawer's fields from the schema. Session edits apply immediately without restarting the run when safe.
9. Mark values that require a level restart, sheet restart, or new run.
10. Provide **Export JSON** so browser tuning can replace the checked-in config after review.

The Tuning Drawer cannot silently write repository files. Exported JSON must be reviewed and committed normally.

### No-magic-number rule

Game code may contain mathematical constants intrinsic to an algorithm, but no balance value. Sheet counts, sizes, durations, thresholds, ratios, score values, multipliers, prices, effect strengths, and UI timings all come from the JSON configuration.

Tests load the same configuration and verify:

- Every numeric value is finite and within schema bounds.
- All referenced size and upgrade IDs exist.
- Prices exist for both categories.
- Shop counts do not exceed the unique upgrade pool.
- Hazard weights are positive.
- Timed levels have valid timer parameters.
- Conveyor stages are ordered and fit inside its duration.

## Core contracts

### Game phase

```ts
type GamePhase =
  | 'mode-select'
  | 'level-intro'
  | 'playing'
  | 'sheet-transition'
  | 'shop'
  | 'run-won'
  | 'run-lost';
```

### Pop source and event

```ts
type PopSource = 'manual' | 'assisted' | 'hazard' | 'system';
type InputKind = 'touch' | 'pointer' | 'keyboard';

interface GamePopEvent {
  bubbleId: string;
  sheetId: string;
  source: PopSource;
  input?: InputKind;
  gameTimeMs: number;
  position: { x: number; y: number };
  skill: 'none' | 'clean-sweep' | 'hot-key';
  baseScore: number;
  firstScoredPop: boolean;
}
```

### Run state

```ts
interface RunState {
  seed: number;
  phase: GamePhase;
  category: 'touch' | 'keyboard-pointer' | null;
  level: 1 | 2 | 3 | 4 | 5;
  score: number;
  upgrades: string[];
  rerollUsed: boolean;
  calibration: CalibrationResult | null;
  encounter: EncounterState | null;
  stats: RunStats;
}
```

### Engine-facing game API

The game layer needs public, bounded operations:

```ts
interface BubbleGameAdapter {
  listBubbles(): readonly BubbleSnapshot[];
  resolveManualPop(index: number, input: InputKind): PopResolution;
  resolveAssistedHit(index: number): PopResolution;
  setBubbleLayers(index: number, layers: number): void;
  setBubbleHold(index: number, progress: number): void;
  reinflate(index: number): void;
  resetSheet(options: GameSheetOptions): void;
  setInputLocked(locked: boolean): void;
}
```

Implementation should expose only the minimum methods required by the game. The adapter translates engine callbacks into game events and avoids making renderer internals part of the rules API.

## Delivery protocol

Development proceeds as small vertical slices, not one large implementation.

For every slice:

1. Implement only the named behavior.
2. Add focused unit and browser coverage.
3. Run the existing Free Pop regression suite.
4. Commit and push the slice.
5. Update the Netlify deploy preview.
6. At designated checkpoints, stop and give the user a short test script.
7. Do not begin the next checkpoint group until the user confirms, reports issues, or explicitly asks to continue autonomously.

User checkpoints must test the real preview on both phone and desktop when the slice affects touch, keyboard, responsive layout, audio, haptics, hold behavior, or hidden-tab recovery.

## Stage A: config and deterministic foundations

### Slice A1: config pipeline

Build:

- Add JSON Schema for `config/level-design.json`.
- Validate before every build.
- Generate typed, immutable TypeScript config.
- Add JSON watch/rebuild/live-reload development command.
- Add tests for references, bounds, and ordering.

Exit:

- Editing one JSON number changes generated config after reload.
- Invalid JSON or out-of-range values fail with an exact property path.
- Production and standalone builds embed the same revision.

### Slice A2: nine bubble-size presets

Build:

- Refactor size labels and values to consume generated config.
- Add XXXS, XXS, XXL, and XXXL to the existing XS–XL set.
- Preserve the current default S.
- Confirm engine clamps support 24–148 pixels.

Tests:

- All nine values sanitize and render.
- Unknown values are rejected.
- Free Pop size changes still reset safely.
- Small and large extremes retain valid hit targets and finite geometry.

### Slice A3: pure game foundations

Build:

- Add seeded RNG with serializable state.
- Add a pausable monotonic game clock.
- Define game types and legal phase reducer.
- Add fixture states for UI development.

Tests:

- Same seed produces identical choices.
- Hidden/paused time does not advance.
- Illegal transitions are rejected.
- Reset removes all transient state.

## Stage B: UI before gameplay

This stage deliberately uses fixture data. No encounter functionality is required yet.

### Slice B1: mode selection

Build:

- Add a minimal entry screen with Free Pop and Survival Run.
- Keep Free Pop behavior unchanged.
- Add local high-score placeholders for both categories.
- Add route/query support for opening a screen directly during development.

### Slice B2: responsive HUD

Build:

- Render fixture level, score, sheet count, timer, combo, velocity, multiplier, upgrades, and hazard.
- Define compact phone and expanded desktop layouts.
- Add danger-zone, soft-timer-expired, paused, and hidden-HUD states.
- Add accessible live-region strategy without announcing every pop.

### Slice B3: shop and result screens

Build:

- Render two fixture offers, prices, disabled/affordable states, reroll, buy, and skip.
- Render run-won and run-lost summaries.
- Render level score breakdown and purchase history.
- Use mock actions only.

### Slice B4: Tuning Drawer

Build:

- Add development-only `?game=1&tuning=show`.
- Generate fields from schema groups.
- Apply session overrides immediately when safe.
- Label changes requiring sheet, level, or run restart.
- Export the complete merged JSON.
- Show config revision and validation status.

### User checkpoint 1: visual shell

Stop and ask the user to test:

- Mode selector hierarchy and copy.
- Free Pop still opening and behaving normally.
- HUD legibility on phone and desktop.
- Shop offer density and upgrade descriptions.
- Result screen usefulness.
- All nine sizes in Free Pop.
- Tuning Drawer editing, restart labels, and JSON export.

Do not wire gameplay until this checkpoint is approved.

## Stage C: level 1 and basic scoring

### Slice C1: engine game adapter

Build:

- Add typed manual, assisted, hazard, and system pop sources.
- Add bounded engine adapter methods.
- Lock run category on the first manual pop.
- Keep Free Pop callbacks backward-compatible.

### Slice C2: level-1 state machine

Build:

- Start, intro, active sheet, sheet transition, completion, and retry states.
- Force 2 M sheets from config.
- Disable shops, hazards, timers, and upgrades.
- Add onboarding prompts.

### Slice C3: base skill scoring

Build one mechanic at a time:

1. Base 10-point manual scoring.
2. Clean Sweep gesture tracking.
3. Hot Key selection and rotation.
4. Combo grace and HUD.
5. Local category high-score write.

Tests:

- Manual and assisted sources cannot be confused.
- Clean Sweep starts at configured crossing count.
- Hot Key changes only after success.
- Input changes do not change run category.
- Held key repeat remains ignored.

### User checkpoint 2: first playable loop

Ask the user to clear level 1 using:

- Phone tap and drag.
- Desktop pointer.
- Desktop keyboard.
- Mixed input after category lock.

Collect feedback on HUD obstruction, score readability, skill feedback, sheet transitions, audio, and haptics before adding timers.

## Stage D: timers and pressure

### Slice D1: level 2 soft timer

Build:

- Five M sheets.
- Soft par timer from category config.
- Remaining-time payout.
- Manual pops-per-second KPI.
- Continue after zero without failure.

### Slice D2: calibration

Build:

- Active-window sampling.
- Exclude idle, transition, pause, hidden, and assisted time.
- Clamp by category config.
- Add a diagnostics panel in Tuning Drawer showing sampled windows and result.

### Slice D3: level 3 hard deadline

Build:

- Five L sheets.
- Calibrated deadline and clamp.
- Danger-zone HUD.
- Timeout loss and full run reset.
- No upgrades yet, so base difficulty can be validated first.

### User checkpoint 3: difficulty baseline

Ask the user for repeated Touch and Keyboard & Pointer runs. Confirm:

- Level 2 feels informative rather than punitive.
- Calibrated level 3 is difficult but possible.
- Pausing/backgrounding never consumes time.
- Timer, danger treatment, and loss flow are readable.

Tune JSON before building shops.

## Stage E: shop and upgrades

### Slice E1: real shop

Build:

- Two seeded random unowned offers.
- Fixed category prices from JSON.
- One score-paid reroll.
- Buy at most one or skip.
- Prevent negative score and repeated owned offers.

### Slice E2: proc queue plus Fat Finger

Build:

- Deterministic pop resolution order.
- Assisted score fixed at 2.
- No assisted recursion.
- Implement Fat Finger only.

### User checkpoint 4: economy and first upgrade

Ask the user to test offer quality, prices, reroll, spending pain, Fat Finger power, and assisted-pop feedback. Tune before adding more effects.

### Slices E3–E10: one upgrade at a time

Implement and test in this order:

1. Rough Table.
2. Knuckle Crack.
3. Static Discharge.
4. Velocity Buff.
5. Deadline Fighter.
6. Sure Hands.
7. Second Wind.
8. Bubble Insurance placeholder behavior, completed with the conveyor.

Each slice gets:

- One focused implementation commit.
- Unit coverage for trigger, reset, score, and interactions.
- HUD feedback.
- Config-driven values only.

### User checkpoint 5: complete build system

Stop after the first four upgrades, and again after all nine. Ask the user to compare several seeded builds and tune prices/effect strengths through the JSON/Tuning Drawer.

## Stage F: hazards, one by one

### Slice F1: hazard selection and announcement

- Equal seeded selection from config weights.
- Level-4 intro and rule summary.
- Three M sheets and hazard-adjusted deadline.

### Slice F2: Double Layer

- Two-hit state, visuals, accessible state, and assisted-layer removal.

### Slice F3: Memory Foam

- Warning, reinflation, completion cancellation, and anti-farming.

### User checkpoint 6: first hazard pair

Ask the user to validate visual clarity, deadlines, Fat Finger interactions, and whether reinflation feels pressuring rather than annoying.

### Slice F4: Hardened Bubbles

- Touch/pointer hold.
- Keyboard hold.
- Progress ring, 0.4-second decay, combo pause, and 30-point base.
- Pointer-cancel and app-background safety.

### User checkpoint 7: physical-phone hold

Require a real-phone test before continuing. Confirm 1.5 seconds, finger jitter, haptics, audio, progress visibility, and release decay.

### Slice F5: Drunken Bob

- Global seeded rolls.
- No-progress feedback.
- Three-failure pity.
- Skill-bonus suppression.
- Visible lurch on selected target.

### User checkpoint 8: chaos test

Ask whether Drunken Bob is confusing in the intended way rather than merely frustrating. Tune pity, deadline allowance, feedback, or selection weight in JSON.

## Stage G: conveyor, visuals before rules

### Slice G1: non-interactive conveyor prototype

- Moving M bubbles in one instanced draw.
- Entry, travel, speed stages, exit, pooling, and reduced-motion treatment.
- Fixture HUD only; no hit testing or score.

### User checkpoint 9: conveyor look and pace

Ask the user to review direction, density, speed stages, cleanup window, phone performance, and motion comfort before gameplay is attached.

### Slice G2: conveyor input

- Moving hit testing.
- Touch/pointer popping.
- Screen-space keyboard groups.
- Miss detection and 10-point penalty.

### Slice G3: completion and build interactions

- 45-second game clock.
- 90% result.
- Fat Finger, Rough Table, Static Discharge, and Bubble Insurance.
- Win/loss and final score screen.

### User checkpoint 10: full run

Ask for complete no-upgrade and upgraded runs in both categories. Tune spawn density, speed, threshold, penalties, insurance, and prices before polish.

## Stage H: release polish

Build:

- Final copy and onboarding.
- Audio and haptic cues.
- Screen-reader states.
- Reduced-motion audit.
- Full responsive pass.
- High-score persistence.
- Balance and result diagnostics.

Validation:

- Full unit suite.
- Existing browser/deployment suite.
- Survival Run touch and keyboard E2E.
- WebKit audio recovery.
- Physical-phone haptics, hold, background pause, and conveyor.
- Ten no-upgrade runs per category and hazard.
- Ten seeded build runs per category.

Exit:

- Every GDD balance gate passes.
- Free Pop has no regression.
- No timer, audio, animation, or input lock survives background/foreground.

## Implementation risks

### Engine coupling

Directly mutating engine private arrays would make hazards brittle. Mitigation: a narrow adapter with tested public operations.

### Responsive score economy

Fixed prices can become too cheap or expensive across viewport sizes. Mitigation: retain separate categories, capture per-run bubble counts in result telemetry, and tune against smallest/largest supported viewports.

### Drunken Bob frustration

Global random control intentionally removes agency. Mitigation: clear announcement, visible target reaction, deterministic RNG, and mandatory 3-failure pity.

### Hardened mobile cancellation

Browsers may cancel or transfer pointers. Mitigation: cumulative hold state, 0.4-second decay, pointer-cancel tests, and physical-device validation.

### Conveyor performance

Moving bubbles add per-frame transforms and hit testing. Mitigation: reuse typed arrays and one instanced draw, pool bubble slots, and avoid DOM nodes per bubble.

### Hidden-tab correctness

Wall clocks, audio clocks, and animation clocks can diverge. Mitigation: one pausable game clock is authoritative; audio never owns encounter timing.

### Config drift

Documentation, generated types, and runtime values can diverge. Mitigation: JSON is authoritative, generation is deterministic, schema validation runs before every build, and tests forbid unknown or missing IDs.

## First implementation slice

The first code PR stops after **Slice A1: config pipeline**:

- JSON Schema.
- Build-time validation with property-path errors.
- Generated typed config.
- Config tests.
- Watch/reload development command.
- No gameplay or visible UI change.

The second code PR adds the nine size presets. The UI/HUD/shop mock work then proceeds through Stage B and stops at User checkpoint 1 before any gameplay is wired.
