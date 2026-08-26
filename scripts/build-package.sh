#!/usr/bin/env bash
set -euo pipefail

rm -rf /work/dist
python -m build
python -m twine check /work/dist/*
python - /work/dist/*.whl /work/dist/*.tar.gz <<'PY'
import hashlib
import sys
import tarfile
import zipfile

wheel, sdist = sys.argv[1:]
with zipfile.ZipFile(wheel) as archive:
    names = set(archive.namelist())
    required_suffixes = {
        "share/doc/jupyterlab-codex-status/README.md",
        "share/doc/jupyterlab-codex-status/README_ko.md",
        "share/licenses/jupyterlab-codex-status/LICENSE",
        "share/licenses/jupyterlab-codex-status/NOTICE",
        "jupyterlab_codex_status/data/codex.toml",
    }
    assert all(any(name.endswith(suffix) for name in names) for suffix in required_suffixes)
    manifest_name = next(name for name in names if name.endswith("jupyterlab_codex_status/data/codex.toml"))
    manifest = archive.read(manifest_name)
    blob = hashlib.sha1(f"blob {len(manifest)}\0".encode() + manifest).hexdigest()
    assert blob == "9169e10848e0b3310e53fbf4e4e66b2817886623"

with tarfile.open(sdist, "r:gz") as archive:
    names = set(archive.getnames())
    for basename in ("README.md", "README_ko.md", "LICENSE", "NOTICE"):
        assert any(name.endswith(f"/{basename}") for name in names)
PY
mkdir -p /artifacts
cp /work/dist/* /artifacts/
