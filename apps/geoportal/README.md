# Geoportal

> **Wuppertal's unified geoportal with 2D/3D mapping, oblique imagery, and integrated envirometric data visualization**

## Overview

The Geoportal is a comprehensive mapping application that provides:

- **2D/3D Map Views** - Seamless transition between Leaflet (2D) and Cesium (3D) engines
- **Oblique Imagery** - Navigate and inspect oblique aerial photographs
- **Address Search** - Gazetteer-powered location search
- **Feature Selection** - Interactive map features with detailed information panels
- **Map Measurements** - Distance and area measurement tools
- **Background Styles** - Multiple basemap and terrain options

---

## Architecture

Built on the **Envirometric Map Core** stack:

```
App Layer (this app)
├─ GeoportalMap component
├─ Redux store (feature state, UI preferences)
└─ App-specific providers (Oblique, Measurements)

Library Layer
├─ CarmaMapProviderWrapper (unified provider stack)
├─ MapViewStateProvider (hash routing, view state)
├─ CesiumContext (3D scene management)
├─ ObliqueProvider (oblique imagery coordination)
└─ Hash-based navigation
```

### Key Dependencies

- **Mapping**: `@carma-mapping/engines/cesium`, `@carma-mapping/engines/leaflet`
- **Oblique**: `@carma-mapping/engines/cesium/oblique-mode`
- **Framework**: `@carma-appframeworks/portals`
- **State**: `@reduxjs/toolkit`, `@carma/providers/hash-state`

---

## Development

### Run Dev Server

```bash
npx nx serve geoportal
```

Runs at `http://localhost:4200`

### Build

```bash
npx nx build geoportal
```

Outputs to `dist/apps/geoportal/`

### Type Check

```bash
npx nx type-check geoportal
```

---

## State Management Patterns

This app follows the **hybrid state approach** documented in `.dev-local/docs/geoportal-refactor/`:

| Pattern | Usage |
|---------|-------|
| **Event Bus** | Cesium scene control, style changes, animation coordination |
| **useRef** | Camera tracking, high-frequency values (>5/sec), engine instances |
| **useState (Context)** | UI state (oblique mode, selected feature, tool mode) |
| **Redux** | Persisted preferences, feature flags, cross-cutting app state |

**Performance guideline**: Camera moves trigger **0 rerenders** via refs; user actions trigger **1 rerender** via state.

See: [Architecture Document](./.dev-local/docs/geoportal-refactor/geoportal-architecture-current-vs-vision.md)

---

## Features

### Map Modes

- **2D Mode** - Leaflet-based tile map with vector overlays
- **3D Mode** - Cesium-based photogrammetry, terrain, and 3D buildings
- **Oblique Mode** - Navigate oblique aerial imagery with directional controls

### Tools

- **Address Search** - Gazetteer integration with autocomplete
- **Measurements** - Distance, area, and height measurements
- **Feature Info** - Click features for detailed panels
- **Hash Routing** - Shareable URLs preserve map position and mode

### Performance

- **Lazy Loading** - 3D engine loads only when activated
- **Ref-Based Tracking** - Camera moves don't trigger rerenders
- **Debounced Hash Updates** - URL updates on moveend, not every frame
- **Tile Caching** - Cesium terrain and imagery cache via service worker

---

## Configuration

### Environment Variables

None required for basic operation. Optional:

- `VITE_CESIUM_ION_TOKEN` - Custom Cesium Ion access token (defaults to OSS token)

### App Config

See `src/config/` for:

- `cesium.config.ts` - 3D scene configuration (tilesets, terrain, imagery)
- `gazData.ts` - Gazetteer search configuration
- `app.config.ts` - Feature flags, initial view, layer configuration

---

## Hash State Format

The app uses hash-based routing for shareable map states:

```
#/lat/<lat>/lng/<lng>/zoom/<zoom>/mode/<2d|3d>/heading/<deg>/pitch/<deg>/isOblique/<0|1>
```

**Examples:**

- 2D view: `#/lat/51.2562/lng/7.1508/zoom/15/mode/2d`
- 3D view: `#/lat/51.2562/lng/7.1508/zoom/800/mode/3d/heading/45/pitch/-30`
- Oblique: `#/lat/51.2562/lng/7.1508/zoom/800/mode/3d/isOblique/1/heading/90`

---

## Project Structure

```
apps/geoportal/
├─ public/              # Static assets (icons, data files)
├─ scripts/             # Build/deployment scripts
├─ src/
│  ├─ app/
│  │  ├─ components/    # App-specific components (GeoportalMap, panels)
│  │  ├─ config/        # App configuration
│  │  ├─ store/         # Redux store slices
│  │  └─ App.tsx        # Root component
│  ├─ main.tsx          # Entry point
│  └─ styles.css        # Global styles
├─ index.html
├─ vite.config.mts      # Vite configuration
└─ README.md            # This file
```

---

## Related Documentation

- [Architecture Vision](./.dev-local/docs/geoportal-refactor/geoportal-architecture-current-vs-vision.md)
- [State Management Patterns](./.dev-local/docs/geoportal-refactor/geoportal-architecture-current-vs-vision.md#state-management-patterns-event-bus-vs-refs-vs-usestate)
- [Cesium Integration](../../libraries/mapping/engines/cesium/README.md)
- [Oblique Mode](../../libraries/mapping/engines/cesium/oblique-mode/README.md)

---

## Deployment

Built artifacts are deployed via Nx deployment config (see `deployment-config.json`).

**Production URL**: TBD

---

**Status**: Active Development  
**Nx Project**: `geoportal`  
**Type**: Application  
**Framework**: React + Vite + Cesium + Leaflet
