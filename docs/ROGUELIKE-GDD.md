# Bubble Wrap: Survival Run

Status: Draft v0.2
Scope: Five-level MVP  
Branch: `cursor/roguelike-2ece`

## 1. Product statement

Bubble Wrap: Survival Run is a tactile survival roguelike built on the existing bubble-wrap simulation. The player clears increasingly hostile sheets, sacrifices score to buy a small build, and survives a 45-second conveyor miniboss.

The current experience remains available as **Free Pop**. Game mode is a separate entry point and does not remove the studio, material controls, accessibility behavior, audio, haptics, or responsive renderer.

The MVP is a pure run-based game:

- A run contains five levels.
- Failure returns to level 1.
- A completed run ends after the level-5 miniboss.
- No currency, upgrades, hazards, or power carry between runs.
- Only local high scores persist.
- Touch and Keyboard & Pointer have separate high-score categories.

## 2. Design pillars

### Tactile first

Every rule must preserve the direct satisfaction of pressing, dragging, hearing, and feeling bubbles pop. Game UI supports the sheet rather than covering it.

### Survival before score

The primary question is whether the player reaches the end. Score measures execution and doubles as purchasing power, forcing a trade between immediate strength and final rank.

### Short, divergent runs

Three shops, nine unique upgrades, and one of four hazards create meaningful variation inside a compact five-level run.

### Legible unfairness

Hazards can be chaotic, but outcomes must be visibly attributable. Hidden pity rules prevent random states from making a run impossible.

## 3. Modes and score categories

The start screen offers:

- **Free Pop:** current application behavior.
- **Survival Run:** the five-level game.

A run category locks on the first manual pop:

- **Touch:** first manual pop uses a coarse touch pointer.
- **Keyboard & Pointer:** first manual pop uses keyboard, mouse, trackpad, or pen.

The player may change input afterward. The category, shop price schedule, and leaderboard do not change during that run.

## 4. Core loops

### Moment-to-moment

1. Read the current sheet, target, timer, and hazard.
2. Pop manually by touch, pointer, or keyboard.
3. Build a skill chain and pop velocity.
4. Trigger upgrades and assisted pops.
5. Clear the sheet before the encounter failure condition.

### Encounter

1. Announce the level rule.
2. Clear the required sheets or conveyor.
3. Bank the encounter payout.
4. After levels 2–4, enter the shop.

### Run

1. Complete onboarding.
2. Establish a performance baseline in the soft-timed level.
3. Survive two hard encounters.
4. Spend score on up to three unique upgrades.
5. Clear at least 90% of the conveyor.
6. Record the final score in the run category, or reset on failure.

## 5. Input and manual skill

Every successful normal manual pop has a base value of 10, independent of input.

### Touch and pointer: Clean Sweep

- A gesture starts on pointer down and ends on pointer up/cancel.
- The first two unique bubbles in a continuous drag score base value.
- The third and later adjacent bubbles in that gesture receive a +20 skill bonus.
- Crossing empty space does not break the gesture.
- Re-crossing a popped bubble gives no score.
- Hardened Bubbles and Drunken Bob do not qualify for Clean Sweep.

### Keyboard: Hot Key

- Three keyboard groups containing unpopped bubbles are highlighted.
- Popping from a highlighted group receives a +20 skill bonus.
- After a successful Hot Key pop, the highlighted set changes.
- A non-highlighted valid key still pops for base value.
- Held-key repeat remains disabled.
- Drunken Bob disables Hot Key.

### Manual combo

- A manual pop extends the combo window.
- The provisional combo grace is 1 second.
- Assisted pops do not start or extend a combo.
- Holding a Hardened Bubble pauses, rather than breaks, the combo.
- Visibility loss, level transition, shop entry, or game pause clears the combo.

## 6. Scoring

The per-pop equation is:

`manual score = (base + skill bonus + upgrade bonus) × velocity multiplier × deadline multiplier`

Values:

- Normal base: 10.
- Hardened Bubble base: 30.
- Clean Sweep or Hot Key bonus: +20.
- Sure Hands bonus on a skilled pop: +10.
- No Velocity Buff: 1×.
- Velocity Buff: 2×–5× while active.
- No Deadline Fighter: 1×.
- Deadline Fighter: 1×–2× in the danger zone.
- Assisted pop: fixed 2 points, never multiplied.

Integer score is rounded after resolving the complete pop.

### Velocity Buff

- Uses manual pops only.
- Reads a smoothed 1.5-second pop rate.
- Below 2 manual pops per second, multiplier is 1×.
- At activation, multiplier starts at 2×.
- It approaches 5× with diminishing returns.
- Losing the manual combo returns it to 1×.

Provisional curve:

`2 + 3 × (1 - exp(-(rate - 2) / 6))`, clamped to 2×–5×.

### Deadline Fighter

- Danger zone is the final 25% of a hard deadline, capped to the final 10 seconds.
- It is active only while the manual combo is alive.
- Multiplier rises linearly from 1× at danger-zone entry to 2× at zero.
- An inactive combo receives no deadline multiplier.

### Remaining-time payout

Timed encounters apply a completion multiplier to the encounter subtotal:

`1 + 0.5 × remaining / starting time`

The multiplier ranges from 1× to 1.5×. A soft timer at or below zero gives 1× and does not fail the level.

### Score as purchasing power

- Upgrade and reroll costs are subtracted directly from score.
- Score cannot fall below zero.
- Insufficient score blocks the purchase.
- Spending never affects an already-determined survival result.
- Final rank uses the score remaining after all purchases and penalties.

### Numeric display and settlement

- Every score, price, percentage, multiplier, interest payout, and derived game value rounds **up** to at most two decimal places.
- Whole values omit `.00`; values with one meaningful decimal do not gain a redundant trailing zero.
- Currency and score values display with a `$` prefix.
- Internal calculations may retain precision until a value is settled or displayed.

## 7. Live balance source

`config/level-design.json` is the source of truth for every tunable numeric value:

- Bubble-size presets.
- Level sheet counts and sizes.
- Score values, combo windows, and multipliers.
- Calibration bounds and challenge factors.
- Shop offers, rerolls, prices, and upgrade strengths.
- Hazard frequencies, durations, ratios, and pity limits.
- Conveyor duration, speed stages, penalties, and clearance target.
- UI transition and feedback timings.

The prose in this GDD defines intent and behavior. If a numeric value differs, the JSON configuration controls the build.

Development must provide a watched `game:dev` workflow: edit the JSON, receive schema validation with an exact property path, rebuild automatically, and reload the current game. Production builds validate and embed the same file so Netlify and `standalone.html` remain deterministic and offline-capable.

Game modules may not duplicate balance literals. Tests load the same configuration and assert its bounds.

## 8. Fixed shop prices

Prices are provisional tuning constants and differ by run category.

### Touch

- Fat Finger: 1,200
- Velocity Buff: 1,100
- Knuckle Crack: 850
- Deadline Fighter: 850
- Rough Table: 800
- Sure Hands: 750
- Static Discharge: 700
- Second Wind: 650
- Bubble Insurance: 500
- Rate-hike Cycle: 950
- Priority Banking: 650
- Flat Rate: 600
- Reroll: 250

### Keyboard & Pointer

- Fat Finger: 3,000
- Velocity Buff: 2,750
- Knuckle Crack: 2,125
- Deadline Fighter: 2,125
- Rough Table: 2,000
- Sure Hands: 1,875
- Static Discharge: 1,750
- Second Wind: 1,625
- Bubble Insurance: 1,250
- Rate-hike Cycle: 2,375
- Priority Banking: 1,625
- Flat Rate: 1,500
- Reroll: 625

These values must be tuned against real viewport bubble counts before release.

## 9. Run structure

Bubble-size labels retain their current meaning:

- XXXS means 24-pixel bubbles.
- XXS means 32-pixel bubbles.
- XS means 40-pixel bubbles.
- S means 52-pixel bubbles.
- M means 64-pixel bubbles.
- L means 82-pixel bubbles.
- XL means 100-pixel bubbles.
- XXL means 124-pixel bubbles.
- XXXL means 148-pixel bubbles.
- Larger bubbles produce fewer eligible bubbles on the same viewport.

All nine presets are available in Free Pop and to future game encounters. The five-level MVP currently uses M and L only.

Actual bubble count remains responsive. Touch and Keyboard & Pointer scores are compared separately.

### Level 1: Orientation

- Objective: clear 2 M sheets.
- Timer: none.
- Failure: none.
- Upgrades: disabled.
- Shop: none.
- Purpose: explain popping, sheet clearing, Clean Sweep, Hot Key, score, and refresh.
- Performance is not used for calibration.

### Level 2: Tempo

- Objective: clear 5 M sheets.
- Timer: soft par timer.
- Failure: none.
- HUD adds timer, active manual pop rate, and velocity KPI.
- Timer expiry removes the remaining-time bonus; the player continues.
- Level-2 active performance calibrates later encounters.
- Completion opens shop 1.

The initial soft par uses category-specific benchmark seconds per actual eligible bubble plus sheet-transition allowance. The constants remain data-driven and tunable.

### Calibration

Calibration excludes:

- Time before the first pop.
- Sheet transitions.
- Pauses and hidden-tab time.
- Shop time.
- Assisted pops.

It measures robust active windows rather than total level duration. The result is clamped to safe category bounds. Deliberately slow play is allowed; it trades away level-2 time score for easier later survival.

### Level 3: Pressure

- Objective: clear 5 L sheets.
- Timer: calibrated hard deadline.
- Failure: timeout ends the run.
- Target range: 16–28 seconds after clamping.
- Base formula uses actual eligible bubbles, level-2 manual rate, transition allowance, and an initial 0.85 challenge factor.
- Completion opens shop 2.

Purchased upgrades do not make the deadline stricter.

### Level 4: Hazard

- Objective: clear 3 M sheets.
- One hazard is selected with equal 25% probability.
- Timer: calibrated hard deadline with hazard-specific workload allowance.
- Failure: timeout ends the run.
- Completion opens shop 3.

### Level 5: Conveyor Miniboss

- Duration: 45 seconds.
- Bubble size: M.
- Direction: bubbles enter from the left and move to the right.
- Speed increases at 15 and 30 seconds.
- Spawning stops before the final seconds to leave a fair cleanup window.
- Escaping bubbles deduct 10 score.
- Win: at least 90% clearance.
- Failure: below 90% ends the run.
- Completion records the final score and ends the MVP run.

Clearance is:

`(popped + insured misses) / total spawned`

## 10. Shops

Shops appear after levels 2, 3, and 4.

- Show two random unowned upgrades.
- The player may buy at most one.
- Buying dismisses the shop immediately.
- The player may skip and earn interest on the score they kept.
- Base skip interest is 2%, capped at the category-specific maximum in `level-design.json`.
- Before buying, the player may pay for up to three rerolls.
- Each reroll costs 1.5× the preceding reroll, rounded up to two decimals.
- Reroll replaces both offers.
- When the pool permits, reroll cannot repeat either rejected offer.
- Purchased upgrades are unique and cannot level up or reappear.
- The shop previews exact effects and current category price.
- Interest is awarded after the player confirms **Skip**, before the next level.

## 11. Upgrade pool

### Fat Finger

Every successful manual pop assists one random unpopped neighbour.

- Assisted pop awards 2.
- Cannot trigger another effect.
- If no neighbour is eligible, nothing happens.

### Knuckle Crack

Every fifth manual pop in an active combo assists up to two unpopped neighbours of that bubble.

- Counter resets with the combo.
- Assisted pops award 2 each.

### Rough Table

Every four active encounter seconds, assists one bubble.

- Pauses during transitions, menus, and hidden-tab time.
- On a static sheet, chooses a random unpopped bubble.
- On the conveyor, chooses the oldest bubble nearest the exit.

### Static Discharge

Every twelfth manual pop assists the unpopped bubble farthest from the current bubble.

- Counter persists across sheets within the encounter.
- Counter resets between levels.

### Velocity Buff

Enables the 2×–5× diminishing-return manual velocity multiplier.

### Deadline Fighter

Enables the 1×–2× active-combo multiplier in hard-timer danger zones.

### Sure Hands

Skilled manual pops receive +10 in addition to the standard +20 skill bonus.

### Second Wind

Once per run, a hard timer reaching zero automatically adds five seconds.

- Consumed only when it prevents failure.
- Does not replenish.
- The danger zone recalculates against the extended timer.

### Bubble Insurance

The first three conveyor misses:

- Still deduct 10 score.
- Count as cleared for the final percentage.
- Do not return to the belt.

### Rate-hike Cycle

Raises shop-skip interest from 2% to 5%.

- Applies from the next shop onward.
- Does not retroactively change interest already paid.

### Priority Banking

Doubles the maximum interest payout per shop.

- Uses the category-specific base cap.
- Stacks with Rate-hike Cycle.

### Flat Rate

Rerolls remain at their base category price instead of increasing after each use.

- Does not refund earlier rerolls.
- The three-reroll limit still applies.

### Designed, not yet scheduled

These two upgrades are part of the design and are not in `level-design.json` or the shop until their implementation slices are explicitly started.

#### Muscular Finger

Normal dragging is slightly resisted. The bubble under the initial press still pops normally. Every later bubble entered by the same drag must be held for `dragHoldMs` before it pops. Leaving that bubble or lifting the pointer cancels its partial hold. This reuses the Hardened Bubbles hold accumulator, with a much shorter duration and no change to score.

- Proposed base hold: 180 ms.
- Muscular Finger reduces that hold by 70 ms, to 110 ms.
- It does not change the 1.5-second Hardened Bubbles hold.
- The effect should feel like slight resistance, not a second hardened-bubble rule.
- Proposed prices: Touch 900; Keyboard & Pointer 2,250.

#### Fuzzy Keyboard

Without the upgrade, each bubble belongs to exactly one keyboard key. Fuzzy Keyboard also accepts the nearest key on each side in the same keyboard row, so each bubble answers to three keys. Those neighbours follow the bubble's position on the sheet: a bubble in one horizontal band also answers to the keys covering the adjacent bands. One key press still pops only one unpopped bubble. Overlapping key membership exists only while this upgrade is owned. Free Pop keeps the one-key mapping.

- Proposed extra keys: 1 on each side, 3 total.
- Proposed prices: Touch 750; Keyboard & Pointer 1,875.

## 12. Shared proc rules

To avoid recursion and ambiguous scoring:

- Every pop has a source: manual, assisted, hazard, or system.
- Only manual pops build combo, velocity, and upgrade counters.
- Assisted pops award fixed score and cannot trigger any upgrade.
- Hazard reinflation is not a pop.
- Re-popping a reinflated bubble gives progress but no additional base or skill score.
- One bubble can resolve only once per frame.
- Proc order is deterministic: manual score, manual counters, direct upgrade assists, passive assists, completion check.

## 13. Hazards

### Double Layer

- 20% of eligible bubbles receive a second membrane.
- First hit cracks one layer and gives no pop score.
- Second hit pops and scores normally.
- An assisted hit removes one layer.
- Visual state and accessible description expose remaining layers.

### Memory Foam

- Every 3 active seconds, choose one popped bubble.
- Show a 1-second reinflation warning.
- If the sheet is already complete, cancel the warning and clear.
- The bubble reinflates after the warning.
- Re-popping it gives progress but no repeat score.
- Timer pauses outside active play.

### Hardened Bubbles

- 20% of eligible bubbles become hardened.
- Require 1.5 seconds of accumulated hold pressure.
- Releasing decays partial progress to zero over 0.4 seconds.
- Touch/pointer holds the bubble directly.
- Keyboard holds a key mapped to that bubble's group.
- Progress ring and sound communicate pressure.
- Combo timer pauses during a valid hold.
- Successful pop has base value 30 and no Clean Sweep bonus.

### Drunken Bob

- Every valid manual input rolls uniformly across all eligible bubble positions.
- The roll may hit an already popped bubble, causing no progress.
- Three consecutive failed rolls guarantee that the fourth targets an unpopped bubble.
- The failure counter resets after progress.
- Dragging performs one roll for each newly crossed source cell.
- Input location and keyboard group do not constrain the target.
- Clean Sweep and Hot Key are disabled.
- Successful manual pops have base value 10.
- Selected targets visibly lurch before resolving.

## 14. Conveyor rules

The conveyor is a distinct encounter layout, not repeated sheet refreshes.

- Bubbles move continuously in world coordinates.
- A bubble becomes missed when its complete hit area exits the right boundary.
- New spawns remain reachable for a minimum guaranteed interaction window.
- Pointer hit testing follows moving bubble positions.
- Keyboard groups map to current screen-space bands and update as bubbles move.
- Fat Finger resolves against current conveyor neighbours.
- Rough Table prioritizes the closest unpopped bubble to the exit.
- Drunken Bob is not active during the miniboss.
- Visibility loss pauses movement, spawning, timers, audio, and combo.

## 15. HUD and screens

### Start

- Free Pop
- Survival Run
- Local high scores by category
- Sound, haptic, reduced-motion, and keyboard-help access

### Encounter HUD

The sheet remains the visual focus. During Survival Run, remove the page title and the spring-return bubble from both the DOM and the WebGL scene. Hiding only the control leaves the rendered bubble in a corner.

- **Top left:** current `$` score. Pop gains update immediately with a continuous digit transition.
- **Top centre:** one small `pop/s` readout and a 30-second velocity chart drawn with bundled Smoothie Charts. Keep it narrow and at the top. The trace scrolls, its vertical scale eases as the range changes, and manual pops update the rate. Without Velocity Buff it is informational; with the upgrade, its current multiplier appears beside the readout.
- **Top right:** level number, then the goal count in the largest white type, then a smaller unit caption such as “sheets popped” or “bubbles popped”. The level name is omitted.
- **Bottom left:** time remaining only. The colon blinks once per second; the whole countdown blinks in the configured danger-zone window. Do not add a status caption under the time.
- **Bottom centre:** one compact panel containing every owned upgrade. Hover, focus, or tap opens one explanation covering every upgrade in that panel. While an effect is active, its current value appears beside its icon.
- Deadline Fighter does not occupy a permanent top-row chip; its active value appears on its upgrade icon.
- Combo, Hot Key, hazard, and onboarding feedback appear contextually rather than competing with the primary KPI.
- Game type uses a tighter line height than body copy so the HUD stays compact on a phone.
- One Material Symbols overflow button at the bottom right contains Refresh sheet, Mute, Shop preview, Modes, Run won preview, and Tuning panel. Refresh and mute are not separate corner buttons during Survival Run.

### Shop

- Current `$` score
- Two offers with exact effects and `$` prices
- Up to three progressively more expensive rerolls, with rerolls remaining shown below the action
- **Skip**, with the current interest rate and capped payout explained below
- Buying dismisses the shop immediately

### Run end

- Win or failure reason
- Final score
- Category
- Per-level time and score
- Purchases and spending
- Manual, assisted, missed, and skill-pop counts
- Retry and Free Pop

## 16. Accessibility and platform behavior

- Game remains fully playable with touch, pointer, or keyboard.
- No upgrade is required to complete the tuned base run.
- Reduced motion removes decorative flex and travel but preserves essential conveyor movement and timing.
- Timers and game simulation pause when the page is hidden or the app backgrounds.
- Returning requires a user gesture to recover mobile audio, without consuming game time.
- Haptics remain optional and capability-dependent.
- Hazard states use shape, motion, labels, and contrast rather than color alone.
- Hardened progress and Double Layer state receive screen-reader text.
- Drunken Bob is announced before the encounter and never appears without warning.
- Game icons use filled, rounded Google Material Symbols at weight 600 and retain accessible text labels.
- Tuning controls use Tweakpane with enlarged text and touch targets; native labels remain readable at browser zoom and on narrow screens.
- Animated numbers respect reduced-motion preferences and remain exposed as ordinary readable text to assistive technology.

## 17. Persistence

Persist locally:

- Best completed Touch score.
- Best completed Keyboard & Pointer score.
- Audio, haptic, reduced-motion, and help preferences.

Do not persist:

- Score balance.
- Current run.
- Upgrades.
- Hazard state.
- Calibration.
- Permanent currency or power.

## 18. Out of scope for the MVP

- Levels beyond 5.
- Meta-progression or unlock trees.
- Online leaderboards or accounts.
- Daily seeds.
- Multiplayer.
- Upgrade stacking or rarity levels.
- More bosses.
- Server persistence.
- Monetization.

## 19. Balance gates

Before implementation is considered release-ready:

- A no-upgrade run must be winnable in both categories.
- Each upgrade must materially change at least one later encounter.
- No upgrade may recursively trigger itself or another upgrade.
- All four hazards must remain winnable with no upgrade.
- Drunken Bob's pity rule must cap failed progress streaks at 3.
- Hardened Bubble holds must survive ordinary mobile pointer jitter.
- A hidden/background tab must never advance or fail a run.
- Conveyor bubbles must always have the guaranteed interaction window.
- Shop 1 must be affordable after an ordinary level-2 clear in both categories.
- Final score distributions must be reviewed separately for Touch and Keyboard & Pointer.
