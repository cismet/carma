# TopicMap Hochwasser in Wuppertal (Snapshot Version)

⚠️ **This is a snapshot version with frozen Cesium engine** ⚠️

Flooding Map (Hochwassergefahrenkarte HGK) with integrated 3D component extending the EnviroMetricsMap (2D).

## ⚡ Important Notice

**This version is decoupled from the current state of the Cesium engine and should eventually be replaced by `floodingmap-ng`.**

- **Snapshot Commit**: `d408bffde572947e3237479db590d90bba2e97d0` (October 2025)
- **Cesium Engine**: Frozen at commit `d408bffd` in `src/lib/cesium-engine-snapshot/`
- **Next Generation**: See `../floodingmap-ng/` for the version using current Cesium engine

## Why This Snapshot Exists

This snapshot preserves the working state of floodingmap with the Cesium engine as it existed in October 2025, allowing:
- Continued stable operation during Cesium refactoring
- A reference implementation for comparison
- Independent evolution of the next-generation version

## Architecture

### Cesium Integration

The app uses a **frozen snapshot** of the Cesium engine located in `src/lib/cesium-engine-snapshot/`.

**Import Pattern:**
```typescript
// Cesium engine - FROZEN snapshot
import { useCesiumContext, ... } from "./lib/cesium-engine-snapshot";

// Other packages - CURRENT versions
import { ... } from "@carma/types";
import { ... } from "@carma/geo/types";
import { ... } from "@carma/resources";
```

### Changes vs Old Envirometrics

To enable Cesium CustomViewer lib:
- Redux Store
- HashRouter
- Providers (CesiumContextProvider, HashStateProvider, etc.)

## Type Compatibility

The `CesiumConfig` type is documented in `src/lib/types/CesiumConfig.snapshot.d.ts` for reference.

**Current usage:**
- Config types (`CesiumConfig`, `MarkerModelAsset`, etc.) use **current** `@carma/types`
- Cesium engine implementation uses **snapshot** from `src/lib/cesium-engine-snapshot/`

This works because the config interface remained stable between the snapshot and current versions.

## Development

```bash
# Build
npx nx build wuppertal-floodingmap

# Serve
npx nx serve wuppertal-floodingmap
```

## Migration Path

1. ✅ Current: Stable snapshot version (this directory)
2. 🚧 In Progress: Next-generation version (`../floodingmap-ng/`)
3. 🎯 Future: Replace this snapshot with `floodingmap-ng` once stable

## Documentation

See `SNAPSHOT-INFO.md` for detailed information about:
- Snapshot source and rationale
- Changes made to imports
- CesiumConfig type evolution
- Testing and verification

---

**Status**: Stable snapshot - maintenance mode only. New features should target `floodingmap-ng`.
