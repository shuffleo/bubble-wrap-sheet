# Supplied audio analysis

Sound effects by Anthousai on Freesound under CC0 (attribution and license supplied by the user).

30 Hz two-pole high-pass, polyphase 96k to 48k resampling, stereo-preserving crop, peak normalization, short boundary fades, 16-bit PCM.

| Source | Original | App sample | Removed before / after | Peak | Strong attack |
|---|---:|---:|---:|---:|---:|
| single 1.wav | 596.7 ms | 42.0 ms | 166.5 / 388.2 ms | -3.1 dBFS | 2.77 ms |
| single 2.wav | 326.8 ms | 87.0 ms | 0.0 / 239.8 ms | -3.1 dBFS | 0.29 ms |
| single 3.wav | 608.1 ms | 96.0 ms | 158.5 / 353.6 ms | -3.1 dBFS | 2.60 ms |
| refresh sound.wav | 1129.3 ms | 1129.4 ms | 0.0 / 0.0 ms | -3.7 dBFS | 2.27 ms |

## Why more than silence trimming was needed

The first and third files contain separate handling cracks. Playing their entire trimmed content would delay the principal pop and sound like multiple bubbles. The default bank uses explicit main-crack windows, with the 6 ms double transient in pop 1 retained as one short crack. The complete outer-silence-trimmed versions remain in `processed/*-full-clean.wav`. No audio was generated or substituted.

The refresh recording has useful sound essentially throughout its 1.129 s duration. It is not shortened to an arbitrary animation length. Full-sheet refresh uses the whole cleaned clip at original pitch. Partial/empty refresh takes a click-safe excerpt; slide mode has a 0.72 s default minimum. The visual transition and audio use the same clock and planned duration.

Peak matching is not a perceptual loudness guarantee. Playback applies small randomized pitch, level and high-shelf variations to the three distinct recordings, using an equal-frequency shuffle bag without immediate repeats. A compressor provides overlap headroom. Audition final levels on physical speakers/headphones.

See `analysis.json` for exact sample counts, onset measurements, hashes, and source-format details. The original 24-bit 96 kHz stereo files are retained unchanged.
