#!/usr/bin/env python3
"""Reproducible cleanup of the four supplied recordings, never synthetic substitutes.

Retains source stereo, resamples with polyphase anti-aliasing, removes subsonic DC,
normalizes with headroom, and writes 16-bit PCM WAV. Pop 1 and 3 contain multiple
cracks: the application uses an explicitly selected main-transient crop instead
of delaying playback through the earlier handling noise. Full cleaned versions
are also retained for comparison. Run from any directory.
"""
from pathlib import Path
import hashlib, json, math
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/audio/original'
OUT = ROOT / 'assets/audio/processed'
OUT.mkdir(parents=True, exist_ok=True)
RATE = 48000
# Source-time intervals chosen from 1 ms stereo peak envelopes. Preserve the
# 6 ms double crack inside pop 1, but stop before its separate 212 ms crack.
CROPS = {'single 1.wav': (0.1665, 0.2085),
         'single 2.wav': (0.0, 0.087),
         'single 3.wav': (0.1585, 0.2545)}

def db(v):
    return float(20 * np.log10(max(1e-12, float(v))))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def fade(x, attack, release):
    x = x.copy()
    a = min(len(x)//4, round(attack*RATE))
    b = min(len(x)//4, round(release*RATE))
    if a > 1: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b > 1: x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x

records, manifest = [], []
for num, name in enumerate(['single 1.wav', 'single 2.wav', 'single 3.wav', 'refresh sound.wav']):
    path = SOURCE / name
    original, source_rate = sf.read(path, always_2d=True, dtype='float64')
    if not np.isfinite(original).all(): raise ValueError(f'Nonfinite source: {name}')
    # A causal low cut avoids pre-ringing before the recorded attack.
    clean = sosfilt(butter(2, 30, fs=source_rate, btype='highpass', output='sos'), original, axis=0)
    divisor = math.gcd(source_rate, RATE)
    clean = resample_poly(clean, RATE//divisor, source_rate//divisor, axis=0)
    kind = 'refill' if num == 3 else 'pop'
    peak = np.max(abs(clean))
    active = np.flatnonzero(np.max(abs(clean), axis=1) >= max(1e-5, peak*10**(-46/20)))
    full_start = max(0, int(active[0])-round(.002*RATE))
    full_end = min(len(clean), int(active[-1])+1+round((.025 if kind=='refill' else .018)*RATE))
    full = clean[full_start:full_end]
    target = .65 if kind=='refill' else .70
    full = fade(full * min(4, target / np.max(abs(full))), .0002 if kind=='pop' else .003, .006 if kind=='pop' else .014)
    if kind == 'pop':
        sf.write(OUT/f'pop-{num+1:02d}-full-clean.wav', full, RATE, subtype='PCM_16')
        start, end = [round(v*RATE) for v in CROPS[name]]
    else:
        start, end = full_start, full_end
    selected = clean[start:end]
    gain = min(4, target/np.max(abs(selected)))
    output = fade(selected*gain, .0002 if kind=='pop' else .003, .006 if kind=='pop' else .014)
    filename = f'pop-{num+1:02d}.wav' if kind=='pop' else 'refresh.wav'
    dest = OUT/filename
    sf.write(dest, output, RATE, subtype='PCM_16')
    encoded, _ = sf.read(dest, always_2d=True)
    signal = np.max(abs(encoded), axis=1)
    onset = np.flatnonzero(signal >= signal.max()*10**(-24/20))[0]/RATE
    warnings = []
    if name in ['single 1.wav', 'single 3.wav']:
        warnings.append('Multiple distinct source transients: app version isolates the main crack; full cleaned version is retained separately.')
    if name == 'single 2.wav':
        warnings.append('Attack begins at the original recording boundary; no missing pre-roll was invented.')
    analysis = dict(name=name,kind=kind,sampleRate=RATE,channels=original.shape[1],
        originalSeconds=len(original)/source_rate,processedSeconds=len(encoded)/RATE,
        trimmedStartMs=start/RATE*1000,trimmedEndMs=max(0.,(len(original)/source_rate-end/RATE)*1000),
        inputPeakDbFS=db(np.max(abs(original))),outputPeakDbFS=db(np.max(abs(encoded))),
        outputRmsDbFS=db(np.sqrt(np.mean(encoded**2))),appliedGainDb=db(gain),
        thresholdDbFS=db(peak*10**(-46/20)),clippedInputSamples=int(np.count_nonzero(abs(original)>=1)),warnings=warnings)
    record = dict(**analysis,sourceSampleRate=source_rate,sourceBits=24,firstStrongAttackMs=onset*1000,
        fullCleanSeconds=len(full)/RATE,sourceSha256=sha(path),processedSha256=sha(dest),file=f'assets/audio/processed/{filename}',
        selection='main crack' if kind=='pop' else 'complete cleaned recording')
    records.append(record)
    manifest.append(dict(kind=kind,file=record['file'],analysis=analysis))
    print(f'{name}: {len(original)/source_rate:.6f}s -> {len(encoded)/RATE:.6f}s, attack {onset*1000:.2f}ms, peak {record["outputPeakDbFS"]:.2f}dBFS')

report = dict(version=1,credit='Sound effects by Anthousai on Freesound under CC0 (attribution and license supplied by the user).',
    processing='30 Hz two-pole high-pass, polyphase 96k to 48k resampling, stereo-preserving crop, peak normalization, short boundary fades, 16-bit PCM.',samples=records)
(ROOT/'assets/audio/analysis.json').write_text(json.dumps(report,indent=2)+'\n')
(ROOT/'assets/audio/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
rows=['# Supplied audio analysis','',report['credit'],'',report['processing'],'',
      '| Source | Original | App sample | Removed before / after | Peak | Strong attack |',
      '|---|---:|---:|---:|---:|---:|']
for r in records:
    rows.append(f'| {r["name"]} | {r["originalSeconds"]*1000:.1f} ms | {r["processedSeconds"]*1000:.1f} ms | {r["trimmedStartMs"]:.1f} / {r["trimmedEndMs"]:.1f} ms | {r["outputPeakDbFS"]:.1f} dBFS | {r["firstStrongAttackMs"]:.2f} ms |')
rows+=['','## Why more than silence trimming was needed','',
       'The first and third files contain separate handling cracks. Playing their entire trimmed content would delay the principal pop and sound like multiple bubbles. The default bank uses explicit main-crack windows, with the 6 ms double transient in pop 1 retained as one short crack. The complete outer-silence-trimmed versions remain in `processed/*-full-clean.wav`. No audio was generated or substituted.',
       '', 'The refresh recording has useful sound essentially throughout its 1.129 s duration. It is not shortened to an arbitrary animation length. Full-sheet refresh uses the whole cleaned clip at original pitch. Partial/empty refresh takes a click-safe excerpt; slide mode has a 0.72 s default minimum. The visual transition and audio use the same clock and planned duration.',
       '', 'Peak matching is not a perceptual loudness guarantee. Playback applies small randomized pitch, level and high-shelf variations to the three distinct recordings, using an equal-frequency shuffle bag without immediate repeats. A compressor provides overlap headroom. Audition final levels on physical speakers/headphones.',
       '', 'See `analysis.json` for exact sample counts, onset measurements, hashes, and source-format details. The original 24-bit 96 kHz stereo files are retained unchanged.']
(ROOT/'docs/AUDIO-ANALYSIS.md').write_text('\n'.join(rows)+'\n')
