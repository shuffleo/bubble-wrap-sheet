#!/usr/bin/env python3
"""Package a built release without vendor downloads or runtime-only caches.

Run after npm run build and the desired verification commands. Public deploy
files go at the ZIP root; the complete repository goes under bubble-wrap/.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE_DIRS = {'node_modules', '.compiled', '.git', '__pycache__', '.venv'}
EXCLUDE_SUFFIXES = {'.pyc', '.ttf', '.otf', '.woff', '.woff2'}


def included(path: Path, out: Path) -> bool:
    rel = path.relative_to(ROOT)
    return (path.is_file() and not path.is_symlink()
            and not any(p in EXCLUDE_DIRS for p in rel.parts)
            and path.suffix.lower() not in EXCLUDE_SUFFIXES
            and path.name not in {'.DS_Store', '.env'}
            and not path.name.startswith('.env.')
            and not (out.is_relative_to(ROOT) and path.is_relative_to(out))
            and path.suffix.lower() != '.zip')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT.parent,
                        help='Output directory (default: parent of source repo).')
    args = parser.parse_args()
    out = args.output.resolve()
    if out == ROOT:
        parser.error('Choose an output directory other than the repository root.')
    out.mkdir(parents=True, exist_ok=True)
    for rel in ['dist/index.html', 'standalone.html', 'README.md',
                'assets/audio/processed/pop-01.wav',
                'assets/audio/processed/pop-02.wav',
                'assets/audio/processed/pop-03.wav',
                'assets/audio/processed/refresh.wav',
                'assets/social/bubble-wrap-social-v8.png']:
        if not (ROOT / rel).is_file():
            raise SystemExit(f'Missing {rel}. Run npm run audio/build/social first.')

    preview = out / 'bubble-wrap-release.html'
    shutil.copy2(ROOT / 'standalone.html', preview)
    shutil.copy2(ROOT / 'backups/refresh-insitu.html', out / 'bubble-wrap-refresh-insitu.html')
    source_zip = out / 'bubble-wrap-release.zip'
    with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in sorted(ROOT.rglob('*')):
            if included(path, out):
                z.write(path, 'bubble-wrap/' + path.relative_to(ROOT).as_posix())

    deploy_zip = out / 'bubble-wrap-deploy.zip'
    with zipfile.ZipFile(deploy_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in sorted((ROOT / 'dist').rglob('*')):
            if path.is_file(): z.write(path, path.relative_to(ROOT / 'dist').as_posix())
        z.writestr('README.md', '''# Bubble Wrap - static deployment

Demo Link: https://bubblewrapsheet.netlify.app/

Extract this ZIP and upload the entire directory to your static host. index.html
must be at the published root. Audio, code, shaders, and membrane textures are
embedded in index.html. Public icons, social cards, and processed WAVs are also
included. Keep the assets directory so sharing images and favicons resolve.

The main UI has no settings icon; append ?panel=show to open the studio. The
studio exposes Slide in/out (default) and Refresh insitu. Space refreshes even
an empty sheet. Size S is the default. All random seeds renew at each refresh.

Sound effects by Anthousai on Freesound under CC0 (user-supplied attribution).
Bootstrap Offcanvas and selected glsl-blend functions are MIT licensed. The
photographic reference is user-provided; confirm its redistribution license.

The companion bubble-wrap-release.zip is the full GitHub-ready source package:
README, source, original/processed audio, processing scripts, tests, docs,
licenses, and backups. To change canonical metadata, edit site.config.json in
that source repository and rebuild. This archive does not update the live site
until you deploy it. Browser audio still needs a user gesture.
''')
        for path in sorted((ROOT / 'licenses').glob('*')):
            if path.is_file(): z.write(path, 'licenses/' + path.name)

    audio_zip = out / 'bubble-wrap-processed-audio.zip'
    with zipfile.ZipFile(audio_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in sorted((ROOT / 'assets/audio/processed').glob('*.wav')):
            z.write(path, path.name)
        for rel, name in [('assets/audio/analysis.json', 'analysis.json'),
                          ('docs/AUDIO-ANALYSIS.md', 'README.md'),
                          ('licenses/AUDIO-CC0-NOTICE.md', 'CREDIT.md')]:
            z.write(ROOT / rel, name)

    for path in [source_zip, deploy_zip, audio_zip]:
        with zipfile.ZipFile(path) as z:
            bad = z.testzip()
            if bad: raise RuntimeError(f'Corrupt archive member: {bad}')
    with zipfile.ZipFile(deploy_zip) as z:
        for name in ['index.html', 'favicon.ico', 'README.md',
                     'assets/audio/processed/refresh.wav',
                     'assets/audio/processed/pop-01.wav',
                     'assets/audio/processed/pop-02.wav',
                     'assets/audio/processed/pop-03.wav',
                     'assets/social/bubble-wrap-social-v8.png']:
            assert name in z.namelist(), name
        assert z.read('assets/audio/processed/refresh.wav') == (ROOT / 'assets/audio/processed/refresh.wav').read_bytes()
    manifest = {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p)}
                for p in [preview, source_zip, deploy_zip, audio_zip]}
    (out / 'bubble-wrap-release-checksums.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for name, info in manifest.items(): print(f'{name}: {info["bytes"]:,} bytes')
    print('Archive integrity and required bundled audio verified.')

if __name__ == '__main__':
    main()
