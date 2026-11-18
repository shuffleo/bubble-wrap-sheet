# Audio assets in v8

The prior release had an import/cleanup interface but did not contain the actual uploaded recordings. This is corrected: all three pop WAVs and the refresh WAV are present as original files, processed WAV files, and embedded audio in both the deployable and portable HTML.

**Sound effects by Anthousai on Freesound under CC0.** This attribution and license designation were supplied by the user; specific original sound-page IDs were not supplied. Links: https://freesound.org/people/Anthousai/ , https://freesound.org/ , https://creativecommons.org/publicdomain/zero/1.0/ . The original procedural fallback and crinkle synthesizer are separate project code.

The original stereo recordings are 24-bit 96 kHz. The application uses 16-bit 48 kHz stereo: pop 1 is 42 ms, pop 2 is 87 ms, pop 3 is 96 ms, and the full refresh is approximately 1.129 seconds. See `docs/AUDIO-ANALYSIS.md` and `assets/audio/analysis.json` for exact durations, cuts, peaks, onset measurements, hashes, and the reason for selecting a main crack rather than merely trimming silence.

`scripts/process_audio.py` preserves the originals and writes both concise application pops and full cleaned alternatives. `scripts/build.mjs` verifies file presence by reading the processed assets, embeds their actual bytes, and supplies their analyses to the runtime. The runtime PCM decoder does not need a network request or asynchronous codec decode before the first pop. A first gesture still unlocks the AudioContext.

Sample selection uses a shuffle bag: every source appears once per cycle and an immediate same-source repeat is prevented across cycle boundaries. Pitch/rate, small gain, and high-shelf tone variation remain configurable. Recorded pitch differences are preserved, not corrected to one common note.

Slide refresh uses at least 0.72 seconds by default on sparse/empty sheets, bounded by available sample duration. A completely popped sheet gets the full recording at original pitch. Insitu can still play the shorter 0.18-second cue for a single bubble. A shared clock keeps the visible transition and the actual scheduled excerpt duration together. Rapid repeats are coalesced while an exchange is active; mute silences playback while allowing the transition to finish.

Browser import of additional audio remains supported. Such imports live in memory for that session and are not silently written into the repository or localStorage. To permanently replace the defaults, update the original files/processing configuration and rebuild. The supplied recordings need no manual import.
