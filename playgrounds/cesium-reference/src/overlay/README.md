# Cesium Overlay System

A React context-based overlay system for rendering HTML elements positioned relative to 3D coordinates in Cesium.

## Overview

The overlay system provides a way to render HTML content (labels, tooltips, UI elements) that are positioned and tracked relative to 3D world coordinates in a Cesium viewer. Elements automatically update their screen positions as the camera moves.


## Usage

### Setup

Wrap your Cesium application with the `CesiumOverlayProvider`:

```tsx
import { CesiumOverlayProvider } from './overlay';

function App() {
  return (
    <CesiumViewerProvider>
      <CesiumOverlayProvider>
        <YourCesiumApp />
      </CesiumOverlayProvider>
    </CesiumViewerProvider>
  );
}
```
