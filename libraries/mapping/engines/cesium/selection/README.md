# cesium-selection

Cesium selection handling hook and utilities for managing selections in 3D Cesium views.

## Usage

```typescript
import { useSelectionCesium } from '@carma-mapping/engines/cesium/selection';

// Use in components with Cesium context
useSelectionCesium(getIsActive, cesiumOptions, useCameraHeight, duration, durationFactor);
```
