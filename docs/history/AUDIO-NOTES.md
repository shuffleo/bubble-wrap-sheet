# Sampled audio and adaptive refill

Version 7.1.0. No user pop/refill WAV files were available in the conversation or mounted uploads during this update. No Anthousai recording is embedded in the delivered HTML. The shipped sounds are the existing procedural synthesizer. All WAVs under tests/fixtures and evidence are GENERATED test signals, never attributed to Anthousai.

## Requested attribution

The user supplied this credit, now placed at the bottom of the opt-in sidebar:

Sound effects by Anthousai on Freesound under CC0.

- Creator: https://freesound.org/people/Anthousai/
- Platform: https://freesound.org/
- License link: https://creativecommons.org/publicdomain/zero/1.0/

The footer separately reports when recordings are not loaded and the procedural fallback is active. The creator/profile and license destinations were checked; the licenses of the missing individual recordings cannot be verified without their files/source pages. This credit is not a claim that the creator authored the procedural synth or endorses this prototype.

## Import / analysis

Open the page with `?panel=show` and find Audio & performance. Import up to twelve pop clips and one separate refill clip. Decoding and preprocessing happen once at import time, not in the physics loop or on each tap. Imports are transactional: errors do not replace the previous good bank. Concurrent/cleared imports are invalidated by generation IDs. Files remain in memory for the session and are not included in preset JSON.

`bubble-samples.ts`:

1. Validates finite PCM and channel/sample-rate limits; raw files may include up to 30 seconds including silence.
2. Removes DC/very-low-frequency drift with a 20 Hz first-order high-pass. Original decoded buffers remain unchanged.
3. Detects outer silence using a relative -46 dB peak threshold and a bounded quiet-window estimate. Detection uses every channel independently, avoiding stereo phase cancellation.
4. Keeps 2 ms before the first detected signal and 18 ms (pop) / 25 ms (refill) after the last. It does not remove internal gaps.
5. Applies sub-millisecond attack and short release fades to prevent boundary clicks. Normalizes toward 0.70 peak (pop) / 0.65 (refill), with gain increases capped at 4x. This is peak balancing, NOT a claim of measured equal perceived loudness or restoration of clipped transients.
6. Reports original/processed duration, start/end trim, input/output peak, output RMS, gain applied, detection threshold, clipping count and warnings. The panel exports JSON analysis and each cleaned 16-bit PCM WAV.

Pop clips must be at most 3 seconds after trimming; refill clips at most 15 seconds. No spectral de-noising, transient reconstruction, musical-pitch detection or aggressive tail truncation is claimed. No actual user recordings have yet been analyzed or auditioned, so cleanup quality on those recordings remains unknown. The test fixtures verify the algorithm, not suitability of an unavailable sound pack.

## Playback variation

Pop samples are selected through a random shuffle bag: every file is used once per cycle, with no same-file repeat across a cycle boundary when there is more than one file. Each selection adds the existing adjustable pitch/playback-rate variation plus small independent level and high-shelf variations. Defaults for the additional controls are +/-6% level and +/-0.8 dB high-shelf gain. Original pitch differences between files are preserved. Resampling changes both pitch and duration; no time-stretch claim is made.

The shared mute/volume bus, voice limit and cleanup are retained. Sample sources are predecoded. The original procedural pop remains the fallback when no bank is loaded. Repeat-tap crinkles remain procedural.

## Refill timing

Let T be the trimmed refill duration and f the fraction of intact bubbles popped before resetting. Full-sheet resets use the complete clip at its original pitch. A single-cell reset uses min(T, 0.18 seconds) by default. For intermediate populations:

D = min(T, 0.18) + (T - min(T, 0.18)) * f^0.6

The minimum is adjustable. Adaptive mode can be disabled. A partial reset plays the ending segment [T-D, T] with short fades, NOT the entire clip sped up. Source offset and content duration are explicitly passed to AudioBufferSourceNode.start. There is no refill cue at zero pops. The synthesized fallback uses the same population-dependent timing.

The reset wave receives the same D and an elapsed-time function. With running audio, it follows AudioContext.currentTime; without audio it uses a monotonic wall clock. Each local reset uses a time-normalized analytic damped spring: 55% of D is allotted to wave travel, 45% to local reinflation. One bubble uses the whole D without diagonal waiting. Values are pinned exactly to inflated at the endpoint, and cut cells remain flat. A new pop cancels that cell's reset interpolation. This changes reset motion only; ordinary press/pop spring traces remain unchanged.

New resets cancel old refill voices. Delayed audio unlocks over 100 ms discard stale cues rather than play them after the gesture. Reduced-motion mode can skip visual animation intentionally. Scheduling alignment does not guarantee zero output latency: OS audio buffering/Bluetooth and frame presentation remain device-dependent. Physical-device audiovisual synchronization was not measured.

## Verified using generated fixtures

Three padded, differently pitched test pops and one padded refill were imported through the real browser controls. Tests verified trimming, preserved distinct signals, output bounds, WAV/JSON exports, nonrepeating sampling, randomized playback parameters, mute, separate banks, full reset timing, single-cell 0.18 s snippets, original refill pitch and seed regeneration. See TEST-REPORT.md and evidence/generated-audio-analysis.json.

Web Audio primary references:
- https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate
- https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start
