# engines/leaflet/

No sub-projects needed; root acts as api.

**Leaflet Engine Helpers** - Typed wrappers and pure helper functions for Leaflet mapping engine.

## Philosophy

- **Pure Functions** - Stateless helpers for Leaflet operations
- **Naming Conventions** - Reexport to avoid confusion and collisions in Multi-Framework environments: Map to LeafletMap, View to LeafletView etc.
- **Type Conversions** - Bridge between Leaflet Classes and Objects and CARMA unit/serialized types
- **Minimal Wrapper** - Thin layer over Leaflet's native API

## Usage

```typescript
import { Map as LeafletMap } from "leaflet";
```

Repo-internal code should prefer raw `leaflet` imports. This library exists for engine-local typed helpers and conversions, not as a repo-wide root alias policy.

## Structure

- `Map.ts` - LeafletMap type alias, view helpers
- `LatLng.ts` - Coordinate type conversions (Leaflet ↔ CARMA)
- `events.ts` - Leaflet event type definitions

## Type Conversions

Serialized Leaflet types with Units

// L.LatLng Object → LatLngJson
const latLngJson = leafletLatLngToLatLngJson(leafletLatLng);


## Build

```sh
nx build engines/leaflet
```
