# Code Snapshot Strategy

## Overview

Code snapshots are **frozen copies** of libraries used to decouple apps from ongoing refactoring. **Use as LAST RESORT only.**

**Why needed:** Prevents playgrounds, experimental apps, or stable production apps from blocking monorepo-wide refactoring work. Allows parallel development without forcing immediate migration of all consumers.

## When to Use (Last Resort)

**Valid Use Cases:**

1. **Playgrounds** - Need reference to compare against starting point, can have their own dependencies
2. **Legacy apps without active user demand** - Built on old architecture, complete rewrite needed but not in scope of current work

**Invalid:** Avoiding fixes, convenience, temporary workarounds, long-term maintenance

## Current Snapshots (Only 2 Exist)

| App | Snapshot | Commit | Reason |
|-----|----------|--------|--------|
| `cesium-playground` | `cesium-engine-snapshot` | `e31fb3d59` | Reference point for comparison, playground isolation |
| `floodingmap` | `cesium-engine-snapshot` | `e31fb3d59` | Built on old architecture, needs complete rewrite with no user demand |

## Naming Convention

**Pattern:** `*-snapshot` or `*.snapshot`

```text
src/lib/cesium-engine-snapshot/
  lib/
    types/
      cesium-snapshot-types.ts    # Internal deprecated types
  types/
    CesiumConfig.snapshot.d.ts    # Reference type documentation
```

**Type Management:**
- Deprecated types (e.g., `CesiumState`, `SceneStyle`) → `lib/types/cesium-snapshot-types.ts`
- Each types file must include: commit ID, date, source path, DO NOT MODIFY warning
- Export from snapshot index for app usage

## VS Code Configuration

Add to `.vscode/settings.json`:

```json
{
  "search.exclude": {
    "**/*-snapshot/**": true,
    "**/*.snapshot/**": true
  }
}
```

Snapshots excluded from search, visible in file explorer.

## Documentation Required

1. **README** in snapshot dir: source commit, why frozen, migration path
2. **SNAPSHOT-INFO.md** in app root: technical details, changes made
3. **App README**: warning, link to next-gen version, timeline

## Lifecycle

**Creation:** Copy at commit → Document → Update imports → Remove unused features

**Maintenance:**

- Snapshot code is read-only, no updates
- **Exception:** Update to use current `@carma/types`, `@carma/resources`, `@carma-commons/*` packages
- Only snapshot types/commons if incompatible with frozen engine

**Deprecation:** Stabilize next-gen → Test → Replace → Delete

## Rules

- Document thoroughly, set migration timeline, keep minimal
- Don't create casually, update code, share between apps, or keep long-term

**Snapshots are technical debt. Use sparingly, remove quickly.**
