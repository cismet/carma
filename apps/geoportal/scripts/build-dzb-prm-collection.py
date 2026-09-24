#!/usr/bin/env python3
"""Fetch original DZ_B_PRM STLs and build a reproducible GLB collection.

The source downloads and derivatives are kept in separate directories.  Run
with Python 3; Blender is launched once per part and quality so interrupted
builds can resume without discarding valid outputs.
"""

import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path


SOURCE = "https://adhocdata.cismet.de/DZ_B_PRM"
CATALOG_BRIDGE_URL = "https://wupp-3d-data.cismet.de/mesh2024/assets/bridge.glb"
PARTS = {
    "environment": ("Umgebung", "umgebung.stl", None),
    "zoo": ("Zoo", "zoo.stl", None),
    "bridge": ("Brücke", "bruecke.stl", "planning"),
    "bridge-existing": ("Brücke", "bruecke-bestand.stl", "existing"),
    "station": ("Bergstation", "bergstation.stl", None),
}
QUALITY_FOLDER = {"2m": "2m", "5m": "5m", "original": "full"}
FOOTPRINTS = {
    "wgs84": "zoo-modell-lage-wgs84.geojson",
    "epsg3857": "zoo-modell-lage-3857.geojson",
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url, destination):
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".download")
    if temporary.exists():
        raise FileExistsError(f"Interrupted download: {temporary}")
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            with temporary.open("xb") as output:
                while block := response.read(1024 * 1024):
                    output.write(block)
        temporary.replace(destination)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def verified_derivative(glb, report, source):
    if not glb.is_file() or not report.is_file():
        return False
    metadata = json.loads(report.read_text(encoding="utf-8"))
    return (
        metadata.get("source", {}).get("sha256") == sha256(source)
        and metadata.get("glb", {}).get("sha256") == sha256(glb)
    )


def package_large_glb(glb):
    """Keep each checked-in asset below GitHub's 100 MB single-file limit."""
    # Decision: preserve the exact Meshopt GLB in deterministic gzip; see
    # apps/geoportal/scripts/README.dz-b-prm.md#asset-packaging-decision.
    if not glb.exists():
        packed = glb.with_suffix(glb.suffix + ".gz")
        if packed.is_file():
            return packed
        raise FileNotFoundError(glb)
    if glb.stat().st_size <= 95_000_000:
        return glb
    packed = glb.with_suffix(glb.suffix + ".gz")
    if not packed.exists():
        temporary = packed.with_name(packed.name + ".building")
        if temporary.exists():
            raise FileExistsError(f"Remove stale package first: {temporary}")
        with glb.open("rb") as source, temporary.open("xb") as output:
            with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0,
                               compresslevel=9) as compressor:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    compressor.write(block)
        temporary.replace(packed)
    if packed.stat().st_size >= 100_000_000:
        raise ValueError(f"Compressed asset exceeds GitHub's 100 MB limit: {packed}")
    with gzip.open(packed, "rb") as compressed, glb.open("rb") as original:
        for block in iter(lambda: original.read(1024 * 1024), b""):
            if compressed.read(len(block)) != block:
                raise ValueError(f"Compressed asset differs from GLB: {packed}")
        if compressed.read(1):
            raise ValueError(f"Compressed asset has trailing data: {packed}")
    return packed


def verified_glb_sha(glb, expected):
    if glb.is_file():
        return sha256(glb) == expected
    packed = glb.with_suffix(glb.suffix + ".gz")
    if not packed.is_file():
        return False
    digest = hashlib.sha256()
    with gzip.open(packed, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest() == expected


def collection_entry(quality, output_dir):
    parts = {}
    for part_id, (label, _, variant) in PARTS.items():
        report = json.loads(
            (output_dir / quality / f"{part_id}.asset.json").read_text(
                encoding="utf-8"
            )
        )
        glb = output_dir / quality / f"{part_id}.glb"
        packaged = package_large_glb(glb)
        parts[part_id] = {
            "label": label,
            "variant": variant,
            "uri": f"{quality}/{packaged.name}",
            "provenance": f"{quality}/{part_id}.asset.json",
            "sourceSha256": report["source"]["sha256"],
            "glbSha256": report["glb"]["sha256"],
            "bytes": report["glb"]["bytes"],
            "packageSha256": sha256(packaged),
            "packageBytes": packaged.stat().st_size,
            "bounds3857": report["georeference"]["mercator_bounds_xy_m"],
        }
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--qualities", nargs="+", choices=QUALITY_FOLDER,
                        default=["2m", "5m"])
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--manifest-only", action="store_true",
                        help="Index already-built, provenance-verified GLBs")
    parser.add_argument("--catalog-bridge", action="store_true",
                        help="Cache the separately catalogued 2025 bridge GLB")
    parser.add_argument("--catalog-bridge-only", action="store_true",
                        help="Fetch just the optional catalog bridge source")
    args = parser.parse_args()
    if args.catalog_bridge_only:
        destination = args.raw_dir / "catalog" / "bridge.glb"
        if args.dry_run:
            print(f"{CATALOG_BRIDGE_URL} -> {destination}")
        else:
            download(CATALOG_BRIDGE_URL, destination)
            print(f"{destination}: {destination.stat().st_size} bytes SHA-256 {sha256(destination)}")
        return
    script = Path(__file__).with_name("convert-dzb-prm-stl.py")
    qualities = list(dict.fromkeys(args.qualities))
    for quality in qualities:
        for part_id, (_, filename, _) in PARTS.items():
            source_url = f"{SOURCE}/{QUALITY_FOLDER[quality]}/{filename}"
            source_path = args.raw_dir / QUALITY_FOLDER[quality] / filename
            glb = args.output_dir / quality / f"{part_id}.glb"
            report = args.output_dir / quality / f"{part_id}.asset.json"
            if args.dry_run:
                print(f"{source_url} -> {source_path} -> {glb}")
                continue
            if args.manifest_only:
                if not report.is_file():
                    raise FileNotFoundError(f"Missing derivative or report: {glb}")
                metadata = json.loads(report.read_text(encoding="utf-8"))
                if not verified_glb_sha(glb, metadata.get("glb", {}).get("sha256")):
                    raise ValueError(f"Derivative checksum mismatch: {glb}")
                if (source_path.is_file() and
                        metadata.get("source", {}).get("sha256") != sha256(source_path)):
                    raise ValueError(f"Source checksum mismatch: {source_path}")
                continue
            download(source_url, source_path)
            if verified_derivative(glb, report, source_path):
                print(f"verified {glb}", flush=True)
                continue
            if glb.exists() or report.exists():
                raise ValueError(f"Derivative exists but does not match source: {glb}")
            command = [
                args.blender, "--background", "--factory-startup", "--python",
                str(script), "--", "--part", part_id, "--quality", quality,
                "--input", str(source_path), "--output-dir", str(glb.parent),
            ]
            if part_id == "environment":
                command.extend(["--min-instances", "10"])
            subprocess.run(command, check=True)

    if args.dry_run:
        for filename in FOOTPRINTS.values():
            print(f"{SOURCE}/{filename} -> {args.output_dir / filename}")
        return
    for filename in FOOTPRINTS.values():
        download(f"{SOURCE}/{filename}", args.output_dir / filename)
    if args.catalog_bridge:
        download(CATALOG_BRIDGE_URL, args.raw_dir / "catalog" / "bridge.glb")
    if "2m" in qualities and "5m" in qualities:
        low = collection_entry("2m", args.output_dir)
        high = collection_entry("5m", args.output_dir)
        for part_id in PARTS:
            if low[part_id]["sourceSha256"] == high[part_id]["sourceSha256"]:
                raise ValueError(f"2m and 5m use the same source STL: {part_id}")
    footprint_3857 = json.loads(
        (args.output_dir / FOOTPRINTS["epsg3857"]).read_text(encoding="utf-8")
    )
    board_bounds = footprint_3857["features"][0]["properties"]["bounds_3857"]
    if len(board_bounds) != 4 or not (
        board_bounds[0] < board_bounds[2] and board_bounds[1] < board_bounds[3]
    ):
        raise ValueError("Invalid official EPSG:3857 board extent")
    manifest = {
        "schemaVersion": 1,
        "id": "dz-b-prm",
        "title": "BuGa",
        "source": SOURCE,
        "horizontalCrs": "EPSG:3857",
        "verticalDatum": "DHHN2016",
        "anchor3857": [791706.051, 6664825.628],
        "boardBounds3857": board_bounds,
        "boardBottomHeightMeters": 124.35,
        "footprint": {key: {"uri": filename,
                            "sha256": sha256(args.output_dir / filename)}
                      for key, filename in FOOTPRINTS.items()},
        "groups": [
            {"id": "bridge", "label": "Brücke", "variants":
             {"planning": "bridge", "existing": "bridge-existing",
              "catalog": "catalog-bridge"}},
            {"id": "environment", "label": "Umgebung", "part": "environment"},
            {"id": "zoo", "label": "Zoo", "part": "zoo"},
            {"id": "station", "label": "Bergstation", "part": "station"},
        ],
        "defaultQuality": "5m" if "5m" in qualities else qualities[0],
        "externalModels": {
            "catalog-bridge": {
                "url": CATALOG_BRIDGE_URL,
                "catalog": "BRUECKENENTWURF_GLB",
                "positionWgs84": [7.121277, 51.252545],
                "altitudeMeters": 245.4,
                "headingDegrees": 95.45,
                "sourceSha256": "a8299112a053f2e2e54c8e19ff171ec774e9495315080dd01b0067d52ba2a522",
            }
        },
        "qualities": {quality: collection_entry(quality, args.output_dir)
                      for quality in qualities},
    }
    path = args.output_dir / "collection.json"
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    layer = {
        "id": "dzb-prm-buga",
        "title": "BuGa",
        "description": "Georeferenziertes Zoo-Modell mit austauschbarem Brückeneinsatz.",
        "type": "object",
        "visible": True,
        "hasInfoView": True,
        "pinned": "last",
        "layerInfo": {
            "source": "adhoc-model-collection",
            "mapMode": "2d",
            "modelCollection": "collection.json",
            "bounds3857": board_bounds,
        },
        "other": {
            "serviceName": "adhoc-model-collection",
            "keywords": ["BuGa", "Zoo", "Brücke", "GLB"],
        },
    }
    layer_path = args.output_dir / "buga.layer.json"
    layer_path.write_text(json.dumps(layer, indent=2, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    print(path)
    print(layer_path)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
