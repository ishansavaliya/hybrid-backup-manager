#!/usr/bin/env python3
"""Download official pinned restic, verify SHA256SUMS, then extract a single binary.

HTTPS protects the checksums in transit. Release signing-key verification is a
separate release-hardening gate; this is not a code-signature verification.
"""
import argparse
import bz2
import hashlib
import os
import platform
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

VERSION = '0.18.1'
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
system = platform.system().lower()
if system not in ('windows', 'linux') or platform.machine().lower() not in ('amd64', 'x86_64'):
    raise SystemExit('Only Windows/Linux x64 are validated downloader targets')
archive = f'restic_{VERSION}_{system}_amd64.' + ('zip' if system == 'windows' else 'bz2')
base = f'https://github.com/restic/restic/releases/download/v{VERSION}/'

def get(name):
    with urllib.request.urlopen(base + name, timeout=120) as response:
        return response.read()

checksums = {}
for line in get('SHA256SUMS').decode().splitlines():
    digest, name = line.split(maxsplit=1)
    checksums[name.lstrip('*')] = digest
payload = get(archive)
if hashlib.sha256(payload).hexdigest() != checksums.get(archive):
    raise SystemExit('Restic release checksum mismatch')
if system == 'windows':
    with zipfile.ZipFile(BytesIO(payload)) as z:
        entries = [name for name in z.namelist() if name.endswith('.exe')]
        if len(entries) != 1:
            raise SystemExit('Unexpected release archive')
        binary = z.read(entries[0])
else:
    binary = bz2.decompress(payload)
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
target = output / ('restic.exe' if system == 'windows' else 'restic')
if target.is_symlink():
    raise SystemExit('Refusing symlink output')
temp = output / ('restic-' + os.urandom(8).hex() + '.tmp')
try:
    with temp.open('xb') as stream:
        stream.write(binary)
    temp.chmod(0o755)
    temp.replace(target)
finally:
    temp.unlink(missing_ok=True)
print(f'Verified restic {VERSION}: {target}')
