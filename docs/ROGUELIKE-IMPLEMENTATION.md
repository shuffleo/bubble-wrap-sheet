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

## Proposed source scaffold

```text
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
tests/
  game/
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

## Milestone 0: deterministic foundations

### Build

- Add seeded RNG with serializable state.
- Add a pausable monotonic game clock based on `performance.now()`.
- Define run, encounter, pop, upgrade, hazard, and shop types.
- Add config objects for levels, prices, timers, and effects.
- Add a pure reducer for legal phase transitions.

### Tests

- Same seed produces identical shops, hazards, and target choices.
- Hidden/paused time does not advance game time.
- Invalid phase transitions are rejected.
- Run reset removes all transient state.

### Exit criteria

- No visible product change.
- Pure modules compile and reach full branch coverage for transition rules.

## Milestone 1: mode shell and event instrumentation

### Build

- Add start screen with Free Pop and Survival Run.
- Preserve current startup path under Free Pop.
- Add game HUD container and mode-specific CSS.
- Add explicit manual-pop event details to the engine.
- Lock score category on first manual pop.
- Track active gesture, Clean Sweep, Hot Key, combo, and manual velocity.
- Add local category high-score persistence.

### Tests

- Free Pop behavior and current browser suite remain unchanged.
- Touch locks Touch category; keyboard/mouse locks Keyboard & Pointer.
- Input changes do not change category mid-run.
- Manual and assisted events cannot be confused.
- Clean Sweep starts on the third qualifying bubble.
- Hot Key rotates targets only after a successful highlighted pop.

### Exit criteria

- Level 1 is playable end to end.
- Score uses base and skill bonuses.
- Free Pop remains visually and behaviorally compatible.

## Milestone 2: levels 1–3 and calibration

### Build

- Add sheet-count encounter controller.
- Force game sheet bubble sizes independently from saved Free Pop settings.
- Implement level 1 onboarding prompts.
- Implement level 2 soft timer, KPI display, and remaining-time payout.
- Capture robust active-window calibration from level 2.
- Implement level 3 deadline calculation and clamp.
- Add run loss and retry flow.
- Pause all game time on visibility loss.

### Tests

- Level 1 never fails and never calibrates.
- Level 2 continues after timer expiry.
- Idle and transition time do not affect calibration.
- Level 3 deadline uses actual eligible count and calibrated manual rate.
- Timeout ends the run.
- Backgrounding cannot expire a timer.
- Mobile audio recovery does not consume game time.

### Exit criteria

- A no-shop run can progress through level 3.
- Touch and Keyboard & Pointer produce separate result records.

## Milestone 3: scoring, shops, and upgrades

### Build

- Implement the complete scoring pipeline.
- Add fixed category price schedules.
- Add two-offer shop and one paid reroll.
- Exclude owned upgrades and rejected reroll offers.
- Implement deterministic proc queue and source rules.
- Implement all nine upgrades.
- Add active-upgrade HUD and exact effect copy.

### Tests

- Score ordering matches base, additive bonuses, then multipliers.
- Assisted score is fixed at 2 and never multiplied.
- No assisted effect triggers any upgrade.
- Proc order is stable for a fixed seed.
- Purchases and rerolls cannot make score negative.
- At most one item can be bought per shop.
- Unique upgrades never reappear.
- Second Wind triggers exactly once.
- Bubble Insurance affects clearance but not miss penalty.

### Exit criteria

- Shops appear after levels 2 and 3.
- Every upgrade has a focused unit test and visible HUD feedback.

## Milestone 4: hazard level

### Build

- Add equal seeded selection among four hazards.
- Add hazard announcement before level 4.
- Add hazard-specific deadline workload allowance.
- Implement Double Layer state and visuals.
- Implement Memory Foam warning and reinflation.
- Implement Hardened Bubble hold, decay, keyboard hold, and progress UI.
- Implement Drunken Bob global rolls, failed-roll feedback, and pity.
- Add shop 3 after victory.

### Tests

- Hazard distribution is deterministic and approximately equal over many seeds.
- Double Layer requires two hits and an assist removes one.
- Memory Foam never steals an already-completed sheet.
- Reinflated bubbles cannot be farmed for score.
- Hardened progress fills, decays, and pauses combo.
- Drunken Bob can hit popped bubbles but never fails progress more than 3 consecutive times.
- Drunken Bob disables spatial skill bonuses.

### Exit criteria

- Each hazard is independently winnable without upgrades.
- Three M sheets complete level 4 and open the final shop.

## Milestone 5: conveyor miniboss

### Build

- Add moving bubble layout without using repeated sheet refresh.
- Add world-position hit testing and screen-space keyboard grouping.
- Add left-entry/right-exit spawn lifecycle.
- Add speed stages at 0, 15, and 30 seconds.
- Add cleanup window before 45 seconds.
- Add miss penalties and clearance calculation.
- Integrate Fat Finger, Rough Table, Static Discharge, and Bubble Insurance.
- Add run-win and final breakdown screen.

### Tests

- Every spawn receives the minimum interaction window.
- Exit detection happens only after the complete hit area leaves.
- Movement and spawning pause while hidden.
- Keyboard groups follow current positions.
- Rough Table prioritizes the closest bubble to exit.
- Insured misses retain the score penalty and improve clearance.
- Exactly 90% wins; below 90% loses.

### Exit criteria

- A complete five-level run can win and record a high score.
- A failed conveyor resets to level 1.

## Milestone 6: polish and balance

### Build

- Add final copy, onboarding, score breakdown, and hazard explanations.
- Add reduced-motion behavior that preserves essential conveyor motion.
- Add screen-reader state for layers and hold progress.
- Add audio/haptic cues for skills, assists, warnings, purchases, and failure.
- Tune benchmark pace, deadline clamps, prices, hold percentage, spawn rate, and speed.
- Confirm layout at 320, 390, 520, 760, and desktop widths.

### Validation

- Full unit suite.
- Full existing browser/deployment suite.
- New Survival Run browser flow for touch and keyboard.
- WebKit first-touch and background/foreground audio recovery.
- Manual physical-phone pass for haptics, holds, hidden-tab pause, and conveyor.
- Ten no-upgrade runs per category and hazard.
- Ten seeded build runs per category.

### Exit criteria

- Meets every balance gate in the GDD.
- No regression in Free Pop.
- No timer, audio, animation, or input lock survives a background/foreground cycle.

## Suggested implementation order by file

1. `game-types.ts`, `game-config.ts`, `game-rng.ts`, `game-clock.ts`
2. `game-reducer.ts` and pure tests
3. Bubble engine adapter and manual event metadata
4. `scoring.ts`, Clean Sweep, Hot Key, combo, velocity
5. `game-controller.ts` for levels 1–3
6. `calibration.ts`
7. `shops.ts`, `upgrades.ts`
8. `hazards.ts`
9. `conveyor.ts`
10. `game-ui.ts`, persistence, polish, browser tests

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

## First implementation slice

The first code PR should stop after milestone 1:

- Mode selection.
- Level-1 state machine.
- Category lock.
- Typed manual/assisted pop events.
- Base score, Clean Sweep, Hot Key, and combo HUD.
- Free Pop regression coverage.

This is the smallest vertical slice that validates the game shell without committing to timer, shop, hazard, or conveyor architecture prematurely.
