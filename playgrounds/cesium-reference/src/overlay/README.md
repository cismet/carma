# Cesium Overlay System

A React context-based overlay system for rendering HTML elements positioned with 2D coordinates.

The overlay system provides a way to render HTML Annotation content (labels, tooltips, UI elements) based on 2D positions.

The component itself is agnostic of any 3D engine or framework, so the projection from 3D to 2D should happen in a callback or precomputed.

The Lib provides predefined annotion components and primitives that expect 2D positions.


## Usage

### Setup

Wrap your Application with the `OverlayProvider`:

```tsx
import { OverlayProvider } from './overlay';

function App() {
  return (
      <OverlayProvider>
        <YourCesiumApp />
      </OverlayProvider>
  );
}
```
