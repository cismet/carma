# @carma-cesium

**Curated raw Cesium API surface** - opinionated, reliable subset of Cesium for better manageability.

## Philosophy

- **No Viewer** - use `CesiumWidget` directly for low-level rendering
- **No Entities** - viewer/entity-era runtime belongs in legacy
- **Curated Raw API** - expose only the Cesium symbols we actively use and support
- **No Repo Helper Grab-Bag** - repo-owned helpers do not belong here

## Usage

```typescript
import { Cartesian3, Cartographic, CesiumWidget } from "@carma-cesium";
```

**Import Path**: always use `@carma-cesium` instead of direct `cesium` imports in repo code unless a file is explicitly exempted
**Package Name**: `@carma-cesium/api`

Direct raw `cesium` imports are allowed only as narrow, explicit exceptions for
vendor-near internals such as private shim implementation details. `@carma-cesium`
itself does not expose a namespace escape hatch.

## What Belongs Here

- curated raw Cesium classes, functions, and types
- direct type re-exports from `cesium`
- no repo-specific behavior or orchestration

## What Does Not Belong Here

Use [`@carma-mapping/engines/cesium/core`](../core/README.md) for:

- guards
- serializers and constructor-arg codecs
- scene, camera, terrain, and picking helpers
- widget-only helper factories
- repo-owned transforms and utility helpers

Use [`../legacy/README.md`](../legacy/README.md) for:

- `Viewer`
- entity-based runtime
- legacy viewer/store-bound controls and composition

## Dependencies

This package should stay as close to raw `cesium` as practical.
