# TWIN4ROAD catalog tools

Provider-neutral helpers for building a local annotated TWIN4ROAD data catalog. They contain no private login, remote filesystem path, service-account name, or workstation home path.

Set the catalog root explicitly:

```bash
export TWIN4ROAD_CATALOG_ROOT=/path/to/twin4road
```

The catalog keeps machine-specific source mounts in `$TWIN4ROAD_CATALOG_ROOT/.local/roots.json`; use `roots.example.json` from the catalog as the template.

## Commands

```bash
# Logical file inventory; add --hash-archives for source-archive hashes.
node scripts/catalog/index.mjs --root="$TWIN4ROAD_CATALOG_ROOT"

# ZIP/TAR member index plus source SHA-256.
node scripts/catalog/index-archive.mjs SOURCE.zip "$TWIN4ROAD_CATALOG_ROOT/catalog/archives/source-id"

# Resumable ordinary download.
node scripts/catalog/download-url.mjs URL DESTINATION

# Public Nextcloud file/folder share; --list-only inventories without download.
node scripts/catalog/download-nextcloud.mjs SHARE_URL DESTINATION [--list-only]

# Parallel resumable Range download with mandatory final SHA-256 verification.
node scripts/catalog/download-ranges.mjs URL DESTINATION EXPECTED_BYTES EXPECTED_SHA256 [WORKERS]
```

Downloads always land in an explicit destination. The scripts do not infer or publish private provider roots. Keep original provider files immutable, put small usable annotation materializations below the corresponding dataset asset, and record parent hashes in `provenance.json`.
