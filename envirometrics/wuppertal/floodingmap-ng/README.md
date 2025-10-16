# TopicMap Hochwasser in Wuppertal (Next Generation)

🚀 **This is the next-generation version using the current Cesium engine** 🚀

Flooding Map (Hochwassergefahrenkarte HGK) with integrated 3D component extending the EnviroMetricsMap (2D).

## Version Info

- **Status**: 🚧 Active Development
- **Cesium Engine**: Current version from `@carma-mapping/engines/cesium`
- **Nx Project**: `floodingmap-wuppertal-ng`
- **Stable Version**: See `../floodingmap/` for snapshot with frozen Cesium

## Purpose

This is the **modernized version** of the floodingmap using the latest Cesium engine integration. It incorporates:

- Latest Cesium engine refactoring
- Updated architecture patterns
- Current best practices
- Ongoing improvements

## Architecture

### Cesium Integration

Uses the **current** Cesium engine from the main libraries:

```typescript
import { useCesiumContext, ... } from "@carma-mapping/engines/cesium";
import { CesiumConfig } from "@carma/types";
```

### Changes vs Old Envirometrics

To enable Cesium CustomViewer lib:
- Redux Store
- HashRouter
- Providers (CesiumContextProvider, HashStateProvider, etc.)

## Development

```bash
# Build
npx nx build floodingmap-wuppertal-ng

# Serve
npx nx serve floodingmap-wuppertal-ng
```

## Migration Status

This version is under active development to replace the snapshot version (`../floodingmap/`).

### Key Differences from Snapshot

| Aspect | Snapshot (`floodingmap/`) | Next-Gen (this version) |
|--------|---------------------------|-------------------------|
| Cesium Engine | Frozen at commit `e31fb3d59` | Current from libraries |
| Status | Stable, maintenance only | Active development |
| Updates | No Cesium updates | Gets latest Cesium changes |
| Purpose | Production stability | Future replacement |

## Testing

Ensure compatibility with:
- Latest Cesium engine changes
- Updated type definitions
- New Cesium features

## Deployment

Once stable and tested, this version will replace the snapshot version in production.

---

**Note**: For the stable production version, see `../floodingmap/`
