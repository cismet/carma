# Floodingmap Type Snapshots

This directory contains **reference type documentation** for types that diverge between the snapshot and current `@carma/types`.

## Purpose

These `.snapshot.d.ts` files serve as:
- Historical documentation of the snapshot's expected types
- Reference for understanding the frozen architecture
- Comparison baseline when migrating to next-gen version

## Files

### `CesiumConfig.snapshot.d.ts`

Documents the `CesiumConfigSnapshot` type that the app's config uses.

**Key differences from snapshot's internal type:**
- More detailed structure with explicit provider/tileset records
- Matches actual usage in `config/cesium/cesium.config.ts`
- Frozen from commit `d408bffd` (October 2025)

## Type Hierarchy

```
┌─────────────────────────────────────────────────────┐
│ App Config (config/cesium/cesium.config.ts)        │
│ Uses: CesiumConfigSnapshot                          │
│ From: ./lib/types/CesiumConfig.snapshot.d.ts        │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Snapshot Internal Types                             │
│ Uses: CesiumConfig (simpler version)                │
│ From: ./lib/cesium-engine-snapshot/lib/types/       │
│       cesium-snapshot-types.ts                      │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Current @carma/types                                 │
│ Uses: CesiumConfig (evolved version)                │
│ ⚠️ NOT USED by this snapshot app                    │
└─────────────────────────────────────────────────────┘
```

## Import Rules

**DO NOT** import these snapshot types in new code. They are for documentation only.

**For the snapshot app:**
- Use types from `./lib/cesium-engine-snapshot` for internal engine types
- Use types from `@carma/types` for shared types (when compatible)
- Use types from this directory ONLY as reference documentation

**For new code (floodingmap-ng):**
- Use current `@carma/types` exclusively
- Do not reference these snapshot types

## Maintenance

These files are **read-only**. Do not modify them as they document the frozen state at commit `d408bffd`.
