# @carma-mapping/map-transition-2d-3d

Coordination layer for seamless 2D ↔ 3D map transitions between Leaflet and Cesium.

> **Engine-agnostic transition orchestration** with lifecycle hooks, state management, and smooth camera animations.

## Overview

This library provides a context and event bus system for managing transitions between 2D (Leaflet) and 3D (Cesium) map views. It coordinates state changes, camera positioning, and viewport synchronization while remaining independent of specific mapping engine implementations.

## Features

- **TransitionContext** - React context for centralized transition state
- **Event Bus** - Type-safe pub/sub system for coordination
- **Lifecycle Handlers** - Pre/post-transition hooks for custom logic
- **State Management** - Ref-based state tracking for performance
- **Camera Sync** - Automatic camera position conversion between 2D/3D
- **Animation Support** - Smooth transitions with configurable durations
- **Error Handling** - Robust error recovery and cancellation support

## Usage

### Basic Setup

Wrap your application with both transition and engine contexts:

```tsx
import { TransitionContextProvider } from '@carma-mapping/map-transition-2d-3d';
import { CesiumContextProvider } from '@carma-mapping/engines/cesium';
import { CarmaTopicMapContextProvider } from '@carma-mapping/engines/carma-cismap';

function App() {
  return (
    <TransitionContextProvider>
      <CarmaTopicMapContextProvider>
        <CesiumContextProvider config={cesiumConfig}>
          <MapView />
        </CesiumContextProvider>
      </CarmaTopicMapContextProvider>
    </TransitionContextProvider>
  );
}
```

### Using the Context

```tsx
import { useTransitionContext, MapTransitionState } from '@carma-mapping/map-transition-2d-3d';

function TransitionButton() {
  const { transitionStateRef, subscribe, emit } = useTransitionContext();
  
  const currentState = transitionStateRef.current;
  const is3D = currentState === MapTransitionState.mode3d;
  
  useEffect(() => {
    const unsubscribe = subscribe(
      TransitionCtxEvent.TransitionTo3dStart,
      () => {
        console.log('Starting 3D transition...');
      }
    );
    
    return unsubscribe;
  }, [subscribe]);
  
  return (
    <button onClick={() => emit(TransitionCtxEvent.ToggleMode)}>
      Switch to {is3D ? '2D' : '3D'}
    </button>
  );
}
```

### Lifecycle Hooks

Register handlers that run before/after transitions:

```tsx
import { useTransitionContext, MapTransitionState } from '@carma-mapping/map-transition-2d-3d';

function MyComponent() {
  const { transitionLifecycleRef } = useTransitionContext();
  
  useEffect(() => {
    // Register pre-transition cleanup
    transitionLifecycleRef.current[MapTransitionState.preTransitionTo3d] = async () => {
      console.log('Preparing for 3D...');
      await saveMapState();
      hideIncompatibleLayers();
    };
    
    transitionLifecycleRef.current[MapTransitionState.preTransitionTo2d] = async () => {
      console.log('Preparing for 2D...');
      await clearCesiumCache();
    };
    
    return () => {
      delete transitionLifecycleRef.current[MapTransitionState.preTransitionTo3d];
      delete transitionLifecycleRef.current[MapTransitionState.preTransitionTo2d];
    };
  }, [transitionLifecycleRef]);
}
```

## API Reference

### Hooks

#### `useTransitionContext()`

Access the transition context and control functions.

**Returns:**

- `transitionStateRef` - Current transition state (ref)
- `transitionLifecycleRef` - Lifecycle handler registry
- `subscribe` - Subscribe to transition events
- `emit` - Emit transition events

### Transition States

```typescript
enum MapTransitionState {
  mode2d = "mode2d",
  mode3d = "mode3d",
  preTransitionTo3d = "preTransitionTo3d",
  transitionTo3d = "transitionTo3d",
  postTransitionTo3d = "postTransitionTo3d",
  preTransitionTo2d = "preTransitionTo2d",
  transitionTo2d = "transitionTo2d",
  postTransitionTo2d = "postTransitionTo2d"
}
```

### Events

- **`TransitionTo3dStart`** - 2D → 3D transition initiated
- **`TransitionTo3dComplete`** - 2D → 3D transition finished
- **`TransitionTo2dStart`** - 3D → 2D transition initiated
- **`TransitionTo2dComplete`** - 3D → 2D transition finished
- **`TransitionCancelled`** - Transition aborted or failed
- **`ToggleMode`** - Request to toggle between current modes

## Architecture

This library sits between mapping engines as a neutral coordinator:

```text
┌─────────────────────┐
│   Cesium Engine     │
│  (3D Visualization) │
└──────────┬──────────┘
           │
           │ Coordinates state
           ▼
   ┌───────────────────────┐
   │  TransitionContext    │
   │  - State Management   │
   │  - Event Coordination │
   │  - Lifecycle Hooks    │
   └───────────┬───────────┘
               │
               │ Synchronizes views
               ▼
   ┌───────────────────────┐
   │   Leaflet Engine      │
   │  (2D Map View)        │
   └───────────────────────┘
```

### Key Design Principles

1. **Engine Agnostic** - No direct dependencies on Cesium or Leaflet
2. **Event-Driven** - Pub/sub pattern for loose coupling
3. **Ref-Based State** - No React re-renders for state changes
4. **Extensible** - Lifecycle hooks for custom behavior
5. **Type-Safe** - Full TypeScript support

## Common Patterns

### Disable UI During Transition

```tsx
function MapControls() {
  const { transitionStateRef } = useTransitionContext();
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  useEffect(() => {
    const checkTransition = () => {
      const state = transitionStateRef.current;
      setIsTransitioning(
        state.includes('Transition') && !state.includes('mode')
      );
    };
    
    const interval = setInterval(checkTransition, 100);
    return () => clearInterval(interval);
  }, [transitionStateRef]);
  
  return (
    <div>
      <button disabled={isTransitioning}>Map Control</button>
    </div>
  );
}
```

### Save/Restore Camera Position

```tsx
function CameraStateManager() {
  const { transitionLifecycleRef } = useTransitionContext();
  const savedCameraRef = useRef(null);
  
  useEffect(() => {
    transitionLifecycleRef.current[MapTransitionState.preTransitionTo3d] = () => {
      // Save 2D camera state
      savedCameraRef.current = get2DCameraState();
    };
    
    transitionLifecycleRef.current[MapTransitionState.preTransitionTo2d] = () => {
      // Save 3D camera state
      savedCameraRef.current = get3DCameraState();
    };
  }, [transitionLifecycleRef]);
}
```

## Integration with useMapTransition

The `useMapTransition` hook (provided by this package) implements the actual transition logic:

```tsx
import { useMapTransition } from '@carma-mapping/map-transition-2d-3d';

function MapWrapper() {
  const { transitionTo3d, transitionTo2d } = useMapTransition({
    duration: 1000,
    easingFunction: 'easeInOutCubic'
  });
  
  return (
    <>
      <button onClick={transitionTo3d}>Go 3D</button>
      <button onClick={transitionTo2d}>Go 2D</button>
    </>
  );
}
```

## Related Packages

- **`@carma-mapping/engines/cesium`** - Cesium 3D engine integration
- **`@carma-mapping/engines/carma-cismap`** - Leaflet 2D engine wrapper
- **`@carma-commons/math`** - Camera coordinate transformations

## Build

```sh
nx build map-transition-2d-3d
```

## Test

```sh
nx test map-transition-2d-3d
```

## Lint

```sh
nx lint map-transition-2d-3d
```
