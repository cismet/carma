# @carma-mapping/map-transition-2d-3d

Coordination layer for 2D ↔ 3D map transitions between Leaflet and Cesium.

## Overview

This library provides a context and event bus system for managing transitions between 2D (Leaflet) and 3D (Cesium) map views. It's designed to be engine-agnostic and coordinate state between the two mapping engines.

## Features

- **TransitionContext**: React context for transition state management
- **Event Bus**: Type-safe event system for transition coordination
- **Lifecycle Handlers**: Pre-transition hooks for custom logic
- **State Management**: Centralized transition state tracking

## Usage

### Setup

Wrap your app with the TransitionContextProvider:

```tsx
import { TransitionContextProvider } from '@carma-mapping/map-transition-2d-3d';

function App() {
  return (
    <TransitionContextProvider>
      {/* Your map components */}
    </TransitionContextProvider>
  );
}
```

### Using the Context

```tsx
import { useTransitionContext, TransitionCtxEvent } from '@carma-mapping/map-transition-2d-3d';

function MyComponent() {
  const { transitionStateRef, subscribe, emit } = useTransitionContext();
  
  useEffect(() => {
    const unsubscribe = subscribe(TransitionCtxEvent.TransitionTo3dStart, () => {
      console.log('Transitioning to 3D...');
    });
    
    return unsubscribe;
  }, [subscribe]);
}
```

## Events

- `TransitionTo3dStart` - Emitted when 2D → 3D transition starts
- `TransitionTo3dComplete` - Emitted when 2D → 3D transition completes
- `TransitionTo2dStart` - Emitted when 3D → 2D transition starts
- `TransitionTo2dComplete` - Emitted when 3D → 2D transition completes
- `TransitionCancelled` - Emitted when any transition is cancelled

## Architecture

This library sits between the Cesium and Leaflet engines, providing a neutral coordination layer without depending on either engine's internals.

```
┌─────────────────┐
│   Cesium        │───┐
│   Engine        │   │
└─────────────────┘   │
                      ▼
              ┌───────────────────┐
              │  map-transition   │
              │     -2d-3d        │
              └───────────────────┘
                      ▲
┌─────────────────┐   │
│   Leaflet       │───┘
│   Engine        │
└─────────────────┘
```
