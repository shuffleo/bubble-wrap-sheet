# Survival Run implementation scaffold

This plan implements `docs/ROGUELIKE-GDD.md` without coupling game rules to WebGL rendering. Each milestone leaves Endless Mode functional and adds independently testable game behavior.

## Architecture principles

1. Keep `BubbleEngine` responsible for rendering, physical input, hit testing, and bubble state.
2. Put encounter, score, timer, shop, hazard, and upgrade rules in pure TypeScript modules.
3. Represent every resolved bubble action as a typed event with an explicit source.
4. Use seeded randomness for shops, hazards, Drunken Bob, and assisted targets.
5. Make game time pausable and independent from `AudioContext.currentTime`.
6. Keep Endless Mode as the default compatibility path until Game mode is explicitly selected.
7. Add behavior behind stable APIs; do not reach into engine private fields from the game layer.

## Variant tests

The MVP is one ruleset. Later comparisons, including a different hazard set on each new sheet of the same level, should be config or one planner change. They should not require a new level loop.

- A number-only variant edits `config/level-design.json` and replays the same seed. Sheet counts, sizes, timers, prices, and score values already live there.
- A seeded run is reproducible. Shops, hot keys, hazards, and assisted targets must draw from the run RNG, not `Math.random`.
- `planLevelSheets` fixes every sheet when the level starts: size plus a hazard id list. Today every sheet uses the level size and an empty list. Per-sheet hazards replace that function only, then the existing sheet transition applies the plan.
- The current sheet's hazard ids are stored on the encounter as `sheetHazardIds`. `hazardId` remains the level-scoped selection used by level 4 until a variant needs more than one.
- Scoring, combo, Clean Sweep, and Hot Key stay pure functions of config and events. A mechanic variant is a new function or a config field, not a branch in the renderer.
- The phase reducer does not grow a phase for each mechanic. Sheet content is data on the sheet plan.
- Do not build a variant until a playtest asks for it. Add an extension point only when the current shape would force the level loop to be rewritten.

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
3. Run the existing Endless Mode regression suite.
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
- Endless Mode size changes still reset safely.
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

- Add a minimal entry screen with Endless Mode and Survival Run.
- Keep Endless Mode behavior unchanged.
- Add local high-score placeholders for both categories.
- Add route/query support for opening a screen directly during development.

### Slice B2: responsive HUD

Build:

- Hide the Endless Mode title and remove the spring-return bubble from the WebGL scene while Survival Run is active.
- Put animated `$` score at top left, a small Smoothie Charts `pop/s` trace at top centre, and the goal count in large type with its unit caption underneath at top right.
- Put the countdown at bottom left, with colon and danger-zone blink states and no status caption.
- Group owned upgrades into one bottom-centre panel. One popover explains every owned upgrade, and an active value sits beside its icon.
- Put refresh, mute, and preview/navigation actions in one Material Symbols overflow menu.
- Define compact phone and expanded desktop layouts.
- Add danger-zone, soft-timer-expired, paused, and hidden-HUD states.
- Add accessible live-region strategy without announcing every pop.
- Use Number Flow's vanilla custom element and continuous plugin for changing numbers; retain a text fallback.

### Slice B3: shop and result screens

Build:

- Render two fixture offers, `$` prices, disabled/affordable states, three escalating rerolls, immediate buy dismissal, skip interest, and remaining-reroll captions.
- Render run-won and run-lost summaries.
- Render level score breakdown and purchase history.
- Use mock actions only.

### Slice B4: Tuning Drawer

Build:

- Add development-only `?game=1&tuning=show` using locally bundled Tweakpane.
- Generate fields from schema groups.
- Apply session overrides immediately when safe.
- Label changes requiring sheet, level, or run restart.
- Export the complete merged JSON.
- Show config revision and validation status.
- Increase Tweakpane labels, values, rows, and touch targets for browser zoom and narrow screens.

### User checkpoint 1: visual shell

Stop and ask the user to test:

- Mode selector hierarchy and copy.
- Endless Mode still opening and behaving normally.
- HUD legibility on phone and desktop.
- Shop offer density and upgrade descriptions.
- Result screen usefulness.
- All nine sizes in Endless Mode.
- Tuning Drawer editing, restart labels, and JSON export.

Do not wire gameplay until this checkpoint is approved.

### Checkpoint 1 feedback revision

Before Stage C, revise the visual shell and economy contract:

- Use filled Rounded Google Material Symbols at weight 600 for every game icon.
- Use currency prefixes and ceil-to-two-decimal formatting without redundant `.00`.
- Add Rate-hike Cycle, Priority Banking, and Flat Rate, bringing the unique pool to twelve.
- Skipping a shop pays capped interest; buying closes immediately.
- Allow three rerolls with config-driven geometric price growth unless Flat Rate is owned.
- Keep danger-zone seconds editable in Tweakpane.
- Preserve direct fixture routes as visual regression tools after live gameplay wiring begins.

### Checkpoint 1 HUD follow-up

Apply these visual corrections on phone and desktop before continuing gameplay:

- `display: none` on the spring-return control, then relayout, so its canvas bubble disappears. Visibility hiding is not sufficient.
- Reduce game-UI line height slightly and keep the HUD compact.
- Remove the caption under the countdown.
- Fold refresh and mute into the overflow menu.
- Draw the 30-second pop/s trace with bundled Smoothie Charts, sized to the top bar and updated by manual pops.
- Use one bottom-centre upgrade panel and one combined explanation.
- Make the goal counter the large white text and the unit, such as “sheets popped”, the smaller caption.

### Designed follow-ups — do not implement yet

Record these mechanics in the GDD only until a later slice is explicitly requested. Do not add them to `level-design.json` before that slice.

#### Drag resistance and Muscular Finger

- The initial press target pops normally.
- Each later bubble entered by that drag uses the Hardened Bubbles hold accumulator for a proposed 180 ms.
- Leaving the bubble or releasing the pointer cancels its partial hold.
- Muscular Finger reduces the drag hold by a proposed 70 ms and does not change the 1.5-second hardened hold.
- Keep the resistance subtle.

#### Fuzzy Keyboard

- Base mapping remains one bubble group per key.
- Fuzzy Keyboard adds the neighbouring key on each side of the same keyboard row, chosen from the bubble's sheet position.
- Each owned-upgrade bubble answers to three keys.
- One press still pops one unpopped bubble.
- Endless Mode does not gain overlapping keys.

## Stage C: level 1 and basic scoring

### Slice C1: engine game adapter

Build:

- Add typed manual, assisted, hazard, and system pop sources.
- Add bounded engine adapter methods.
- Lock run category on the first manual pop.
- Keep Endless Mode callbacks backward-compatible.

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

### Checkpoint 2 decision: Run Dossier

Status: **selected and approved for implementation**. Product behavior and content hierarchy live in GDD section 15; this plan only records the engineering work.

- Extend each level's validated config with one medal metric and four ordered numeric thresholds.
- Keep medal evaluation, target formatting, next-medal deltas, goal summaries, and three-level previews in a pure presentation module.
- Store per-level best time and score in a versioned local record, independently of category high scores.
- Reuse shared medal and roadmap markup between fixture routes and live encounters.
- Accumulate attributable scoring components during each level so result rows come from settled score events rather than reverse calculation.
- Stagger result-row entrance without delaying navigation or assistive access to the complete result.
- Expand run-result fixtures and later live telemetry with the statistics required by the GDD.
- Retain direct fixture routes for briefing, roadmap, win, and loss regression coverage.
- Rename the player-facing free-play destination to Endless Mode while keeping the underlying compatibility path unchanged.
- Do not add a bonus-objective subsystem.

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

### Stage D implementation status

Implemented through the Level 3 checkpoint:

- One live encounter state now carries score, category, RNG, sheet plan, and attributable score rows across Levels 1–3.
- Level 2 derives its soft target from actual responsive bubble workload and category tuning, settles remaining time, and never fails at zero.
- Calibration samples manual-pop active windows only, closes windows across transitions and visibility loss, clamps by category, and persists diagnostics for the development drawer.
- Level 3 derives a bounded hard deadline from the calibrated pace and actual L-sheet workload, adds the configured 25-second bonus after that clamp, exposes danger state, and resets the full run after timeout.
- Hard-deadline danger now adds the final-10-second neon treatment, while a shader-backed exposure reminder helps locate one of the final one to three idle bubbles.
- The completed Level 2 now hands off to the Stage E shop instead of bypassing its reducer phase.

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
- Three score-paid rerolls with config-driven escalating prices.
- Buy at most one and dismiss immediately, or skip for capped interest.
- Apply Rate-hike Cycle, Priority Banking, and Flat Rate to the economy calculation.
- Prevent negative score and repeated owned offers.

### Slice E2: proc queue plus Fat Finger

Build:

- Deterministic pop resolution order.
- Assisted score fixed at 2.
- No assisted recursion.
- Implement Fat Finger only.

### Stage E first-checkpoint status

- The Level 2 result now opens a live seeded shop with two unowned offers, score-paid rerolls, immediate purchase dismissal, and capped skip interest.
- The active offer pool contains Fat Finger plus the three economy upgrades; effects scheduled for later Stage E slices remain unavailable until implemented.
- Fat Finger resolves through the manual-only deterministic proc queue, attributes its fixed assisted score separately, and appears in the live build HUD.
- At this first checkpoint, buying or skipping advanced through the reducer's
  existing shop phase into Level 3; Stage F had not yet been enabled.

### Stage E upgrade-batch status

Implemented through Second Wind:

- Rough Table advances on active encounter time only and pauses during sheet
  exchange, menus, and hidden-tab time.
- Knuckle Crack uses the live combo count; Static Discharge uses an
  encounter-scoped manual-pop count and actual bubble positions.
- Velocity Buff, Deadline Fighter, and Sure Hands now resolve in the documented
  score order and add separate attributable result rows.
- Second Wind persists its one use across levels, extends only a hard deadline
  it can actually save, and recalculates the danger multiplier from the extended
  total.
- All seven effects are in the seeded live shop pool with their config prices.
  Assisted effects share a deterministic, non-recursive queue.

### User checkpoint 4: economy and first upgrade

Ask the user to test offer quality, prices, reroll, spending pain, Fat Finger power, and assisted-pop feedback. Tune before adding more effects.

### Slices E3–E13: one upgrade at a time

Implement and test in this order:

1. Rough Table.
2. Knuckle Crack.
3. Static Discharge.
4. Velocity Buff.
5. Deadline Fighter.
6. Sure Hands.
7. Second Wind.
8. Bubble Insurance placeholder behavior, completed with the conveyor.
9. Rate-hike Cycle.
10. Priority Banking.
11. Flat Rate.

Do not start Muscular Finger or Fuzzy Keyboard in this sequence. They stay design-only until requested, then become their own slices after the original twelve.

Each slice gets:

- One focused implementation commit.
- Unit coverage for trigger, reset, score, and interactions.
- HUD feedback.
- Config-driven values only.

### User checkpoint 5: complete build system

Stop after the first four upgrades, and again after all twelve. Ask the user to compare several seeded builds and tune prices/effect strengths through the JSON/Tuning Drawer.

## Stage F: hazards, one by one

### Slice F1: hazard selection and announcement

- Equal seeded selection from config weights.
- Level-4 intro and rule summary.
- Three M sheets and hazard-adjusted deadline.

### Slice F2: Double Layer

- Two-hit state, visuals, accessible state, and assisted-layer removal.

### Slice F3: Memory Foam

- Warning, reinflation, completion cancellation, and anti-farming.

### Stage F first-pair status

Implemented through F3:

- Level 3 now opens shop 2 and advances into a three-sheet Level 4 encounter.
- Level 4 chooses one seeded hazard for the whole level, repeats it in each
  sheet plan, announces it before play, and applies its workload allowance to
  the calibrated deadline.
- The live checkpoint pool contains Double Layer and Memory Foam only.
- Double Layer assigns the configured responsive ratio, exposes its layer state,
  cracks without scoring on the first hit, and lets manual or assisted hits
  remove exactly one membrane.
- Memory Foam uses active encounter time, warns for the configured interval,
  cancels at sheet completion, reinflates through the engine adapter, and
  prevents repeat-score farming.
- The renderer has bounded layer, warning, and reinflation APIs; hazard state
  remains outside persisted run data.
- Shop 3 settles normally, then this checkpoint stops on an explicit Level 5
  handoff screen. It does not enter the static-sheet controller with the
  conveyor's zero-sheet configuration.

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

### Stage F completion status

Implemented through F5:

- Hardened Bubbles assigns the configured responsive ratio, accumulates
  touch/pointer or keyboard pressure for 1.5 seconds, decays released pressure
  over 0.4 seconds, and pauses a live combo while a valid hold continues.
- Hardened progress is exposed through the instanced shader ring, keyboard
  accessibility text, and the bounded game adapter. A completed hold scores the
  configured 30-point base without Clean Sweep or Hot Key.
- Drunken Bob rolls over every eligible position with run-seeded randomness,
  visibly lurches the selected target, reports no-progress rolls, and guarantees
  an unpopped target after three consecutive failures.
- Drunken Bob disables both manual skill bonuses. All four Level 4 hazards now
  participate in the weighted live pool.

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

### Stage G implementation status

Implemented through G3:

- Level 5 is a 45-second moving M-bubble sheet rendered in the existing single
  instanced draw. Columns fill the sheet from top to bottom, scroll right
  together, retain moving pointer hit tests, and rebuild screen-space keyboard
  groups as the sheet advances.
- New columns enter from the left on the same pitch as the lattice. The left
  sheet edge stays offscreen until feeding stops for the cleanup window. Speed
  still increases at 15 and 30 seconds, and a resize keeps the active columns.
- Escapes deduct the configured score penalty. Bubble Insurance still applies
  the penalty but credits its first three misses toward clearance.
- Fat Finger uses current moving neighbours, Rough Table selects the oldest
  bubble nearest the exit, and Static Discharge uses current world positions.
- At 45 seconds, remaining belt bubbles settle as misses. At least 90% clearance
  wins and records the category high score; lower clearance ends the run without
  writing a high score.
- The final dossier reports clearance, medal, final score, build, best-scoring
  level, total/manual/assisted pops, highest combo, rerolls, misses, insurance,
  and attributable conveyor score rows.

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
- Endless Mode has no regression.
- No timer, audio, animation, or input lock survives background/foreground.

### Stage H automated status

- The complete four-hazard pool, fourteen-upgrade shop, and conveyor finale share
  the final onboarding, HUD, result dossier, local category high-score, audio,
  haptic, reduced-motion, and hidden-tab lifecycle paths.
- Hardened state, Double Layer state, and moving keyboard groups retain
  accessible labels; all changing hazard and conveyor outcomes use status text
  in addition to visual treatment.
- Automated validation covers 264 unit/config tests, 78 complete Survival Run
  browser assertions, and 68 Endless Mode/release/deployment assertions.
- The remaining release gate is the documented human phone/desktop playtest:
  hold feel and jitter, Drunken Bob clarity, conveyor motion comfort, haptics,
  and final balance in both score categories.

### Playtest follow-up: labels, patterns, and the result trace

Implemented:

- Survival Run and Endless Mode both keep key labels hidden. A stored Endless preference does not show them. Keyboard pops score base value and do not receive a highlighted-key bonus.
- Cluster Bomb arms one random remaining key group at each 25% of a static sheet, up to three times, and that key pops the group.
- Keyboard Cover shows every key label and removes a label when its bubble pops. With Cluster Bomb, the armed group is the bright set.
- A manual zigzag or swirl/concentric path on a static sheet adds half of that sheet's manual score again. The two patterns do not stack.
- The level-end dossier draws the level's manual velocity samples as a non-interactive decoration.
- These two upgrades are in `level-design.json` and the live shop. The pool is fourteen upgrades.
- The last-bubbles reminder drives the existing dome bounce with the ease-out bounce curve. It no longer multiplies exposure, which was revealing the hexagonal tiles.
- The conveyor is one full-height sheet. Its left edge stays offscreen until the roll stops feeding.
- The live overflow menu opens the level-design tuning sidebar again.

### Still design-only

Muscular Finger and Fuzzy Keyboard are specified in the GDD and are not in the config, shop, or runtime. Every other listed upgrade, all four hazards, both shops' economy effects, sheet patterns, Cluster Bomb, and Keyboard Cover are wired. Balance numbers and in-app copy are the remaining human pass.

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
