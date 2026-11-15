#!/usr/bin/env python3
"""Build deterministic ZotTagClear installation and development archives."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_FILES = ["manifest.json", "bootstrap.js", "LICENSE"]
RUNTIME_DIRS = ["content", "locale", "icons"]


def archive(destination, files, prefix=""):
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as zipped:
        for relative in sorted(files):
            info = ZipInfo(prefix + relative.as_posix(), (1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, (ROOT / relative).read_bytes())


def build(output):
    version = json.loads((ROOT / "manifest.json").read_text())["version"]
    output.mkdir(parents=True, exist_ok=True)
    runtime = [Path(name) for name in RUNTIME_FILES]
    for directory in RUNTIME_DIRS:
        runtime.extend(path.relative_to(ROOT) for path in (ROOT / directory).rglob("*") if path.is_file())
    xpi = output / f"ZotTagClear_v{version}.xpi"
    archive(xpi, runtime)
    release = ROOT / "releases" / f"v{version}"
    release.mkdir(parents=True, exist_ok=True)
    if xpi.resolve() != (release / xpi.name).resolve():
        shutil.copyfile(xpi, release / xpi.name)
    checksum = hashlib.sha256(xpi.read_bytes()).hexdigest()
    (release / "SHA256SUMS.txt").write_text(f"{checksum}  {xpi.name}\n")
    source = list(runtime) + [Path("README.md"), Path("CHANGELOG.md")]
    for directory in ["scripts", "tests"]:
        source.extend(path.relative_to(ROOT) for path in (ROOT / directory).rglob("*")
                      if path.is_file() and "__pycache__" not in path.parts
                      and path.suffix not in [".pyc", ".pyo"])
    source_zip = output / f"ZotTagClear_v{version}_Source.zip"
    archive(source_zip, source, "ZotTagClear/")
    repository = source + [Path(".gitignore"), Path(".gitattributes")]
    repository.extend(path.relative_to(ROOT) for path in (ROOT / "releases").rglob("*") if path.is_file())
    repository_zip = output / f"ZotTagClear_v{version}_GitHub_Repository.zip"
    archive(repository_zip, repository, "ZotTagClear/")
    for artifact in [xpi, source_zip, repository_zip]:
        print(f"{artifact}: {artifact.stat().st_size} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    build(parser.parse_args().output.resolve())
