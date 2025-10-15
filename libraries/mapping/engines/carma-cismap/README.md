# @carma-mapping/engines/carma-cismap

Enhanced Leaflet 2D map engine wrapper built on react-cismap with event bus coordination and simplified API.

> **Augmented react-cismap integration** with event-driven architecture, simplified map access, and state management for CARMA applications.

## Overview

This package wraps react-cismap's `TopicMapComponent` with additional features for CARMA's mapping ecosystem:

- **Event Bus** - Type-safe pub/sub system for map coordination
- **Simplified API** - Direct Leaflet map access without nested refs
- **State Management** - Suspended/Active state tracking
- **Ready State** - Safe map initialization detection
- **Context Forwarding** - Full react-cismap context compatibility
- **TypeScript-First** - Complete type definitions

## Installation

```bash
npm install @carma-mapping/engines/carma-cismap react-cismap leaflet
```

## Basic Usage

### Setup

Replace react-cismap's provider with the CARMA-enhanced version:

```tsx
import { CarmaTopicMapContextProvider } from '@carma-mapping/engines/carma-cismap';
import { TopicMapComponent } from 'react-cismap/TopicMapComponent';

function App() {
  return (
    <CarmaTopicMapContextProvider
      infoBoxPixelWidth={350}
      // ... other react-cismap props
    >
      <TopicMapComponent />
    </CarmaTopicMapContextProvider>
  );
}
```

### Accessing the Map

```tsx
import { useCarmaTopicMapContext } from '@carma-mapping/engines/carma-cismap';

function MapControls() {
  const { leafletMapRef, isMapReady } = useCarmaTopicMapContext();
  
  useEffect(() => {
    const map = leafletMapRef.current;
    if (isMapReady && map) {
      // Direct access to Leaflet map
      map.setZoom(12);
      map.panTo([51.2, 7.1]);
    }
  }, [isMapReady, leafletMapRef]);
  
  return <div>Map Controls</div>;
}
```

**Before (react-cismap):**
```tsx
// Complicated nested ref access
routedMapRef.leafletMap.leafletElement.setZoom(12);
```

**After (carma-cismap):**
```tsx
// Direct, simplified access
leafletMapRef.current.setZoom(12);
```

## API Reference

### Hooks

#### `useCarmaTopicMapContext()`

Access both CARMA and react-cismap context.

**Returns:**

```typescript
{
  // CARMA Extensions
  isSuspendedRef: MutableRefObject<boolean>;  // Suspended state
  subscribe: SubscribeFn;                      // Event subscription
  emit: EmitFn;                               // Event emission
  leafletMapRef: MutableRefObject<L.Map>;     // Direct Leaflet map access
  
  // ... all react-cismap TopicMapContext properties
  routedMapRef: MutableRefObject<any>;
  setAppMenuVisible: (visible: boolean) => void;
  // etc.
}
```

### Context Provider Props

#### `CarmaTopicMapContextProvider`

All react-cismap `TopicMapContextProvider` props plus:

- `children: ReactNode` - Child components

**Forward all react-cismap props:**
```tsx
<CarmaTopicMapContextProvider
  infoBoxPixelWidth={350}
  featureInfoModeActivated={true}
  // ... any other react-cismap props
>
```

## Event System

Subscribe to and emit map-specific events:

```tsx
import { useCarmaTopicMapContext, TopicMapCtxEvent } from '@carma-mapping/engines/carma-cismap';

function MyComponent() {
  const { subscribe, emit } = useCarmaTopicMapContext();
  
  useEffect(() => {
    // Subscribe to events
    const unsubscribe = subscribe(
      TopicMapCtxEvent.MapClicked,
      (coords) => {
        console.log('Map clicked at:', coords);
      }
    );
    
    return unsubscribe;
  }, [subscribe]);
  
  const handleAction = () => {
    // Emit events
    emit(TopicMapCtxEvent.LayerChanged, {
      layerId: 'buildings',
      visible: true
    });
  };
}
```

### Available Events

- `MapClicked` - User clicked on map
- `MapMoved` - Map viewport changed
- `LayerChanged` - Layer visibility/opacity changed
- `FeatureSelected` - Feature clicked/selected
- `Suspend` - Suspend map (e.g., during 3D transition)
- `Activate` - Activate map (e.g., return from 3D)

## State Management

### Suspended State

Track when the map should be inactive (e.g., during 2D/3D transitions):

```tsx
function MapContainer() {
  const { isSuspendedRef, emit } = useCarmaTopicMapContext();
  
  const transitionTo3D = () => {
    // Suspend 2D map before activating 3D
    emit(TopicMapCtxEvent.Suspend);
    isSuspendedRef.current = true;
    
    // ... activate Cesium
  };
  
  return (
    <div style={{ 
      pointerEvents: isSuspendedRef.current ? 'none' : 'auto',
      opacity: isSuspendedRef.current ? 0 : 1
    }}>
      <TopicMapComponent />
    </div>
  );
}
```

## Integration Patterns

### With 2D/3D Transitions

```tsx
import { CarmaTopicMapContextProvider } from '@carma-mapping/engines/carma-cismap';
import { TransitionContextProvider } from '@carma-mapping/map-transition-2d-3d';
import { CesiumContextProvider } from '@carma-mapping/engines/cesium';

function HybridMapApp() {
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

### With Map Controls

```tsx
import { useCarmaTopicMapContext } from '@carma-mapping/engines/carma-cismap';
import { ZoomControl, RoutedMapLocateControl } from '@carma-mapping/components';

function Map2DView() {
  const { leafletMapRef } = useCarmaTopicMapContext();
  
  return (
    <div className="map-container">
      <TopicMapComponent />
      
      <div className="map-controls">
        <ZoomControl />
        <RoutedMapLocateControl />
      </div>
    </div>
  );
}
```

### Safe Map Initialization

Always check `isMapReady` before accessing the map:

```tsx
function MapInteraction() {
  const { leafletMapRef } = useCarmaTopicMapContext();
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    const map = leafletMapRef.current;
    if (map) {
      setIsReady(true);
      
      // Safe to add layers, markers, etc.
      L.marker([51.2, 7.1]).addTo(map);
    }
  }, [leafletMapRef]);
  
  if (!isReady) {
    return <div>Loading map...</div>;
  }
  
  return <div>Map ready!</div>;
}
```

## Common Patterns

### Pan to Location

```tsx
function PanToButton() {
  const { leafletMapRef } = useCarmaTopicMapContext();
  
  const panToLocation = (lat: number, lng: number, zoom?: number) => {
    const map = leafletMapRef.current;
    if (!map) return;
    
    if (zoom) {
      map.setView([lat, lng], zoom);
    } else {
      map.panTo([lat, lng]);
    }
  };
  
  return (
    <button onClick={() => panToLocation(51.2, 7.1, 12)}>
      Go to Location
    </button>
  );
}
```

### Add Custom Layer

```tsx
function CustomLayer() {
  const { leafletMapRef } = useCarmaTopicMapContext();
  
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    
    const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    });
    
    layer.addTo(map);
    
    return () => {
      map.removeLayer(layer);
    };
  }, [leafletMapRef]);
  
  return null;
}
```

### Listen to Map Events

```tsx
function MapEventLogger() {
  const { leafletMapRef } = useCarmaTopicMapContext();
  
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    
    const handleClick = (e: L.LeafletMouseEvent) => {
      console.log('Clicked at:', e.latlng);
    };
    
    const handleZoom = () => {
      console.log('Zoom level:', map.getZoom());
    };
    
    map.on('click', handleClick);
    map.on('zoomend', handleZoom);
    
    return () => {
      map.off('click', handleClick);
      map.off('zoomend', handleZoom);
    };
  }, [leafletMapRef]);
  
  return null;
}
```

## Migration from react-cismap

### Step 1: Update Provider

```tsx
// Before
import { TopicMapContextProvider } from 'react-cismap/contexts/TopicMapContextProvider';

<TopicMapContextProvider>
  <App />
</TopicMapContextProvider>

// After
import { CarmaTopicMapContextProvider } from '@carma-mapping/engines/carma-cismap';

<CarmaTopicMapContextProvider>
  <App />
</CarmaTopicMapContextProvider>
```

### Step 2: Update Context Access

```tsx
// Before
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
const { routedMapRef } = useContext(TopicMapContext);
const map = routedMapRef.leafletMap.leafletElement;

// After
import { useCarmaTopicMapContext } from '@carma-mapping/engines/carma-cismap';
const { leafletMapRef } = useCarmaTopicMapContext();
const map = leafletMapRef.current;
```

### Step 3: Add Event Handling (Optional)

```tsx
// New capability - event bus
const { subscribe, emit } = useCarmaTopicMapContext();

useEffect(() => {
  const unsub = subscribe(TopicMapCtxEvent.MapClicked, handleClick);
  return unsub;
}, [subscribe]);
```

## Best Practices

1. **Always Check Map Ready** - Use `leafletMapRef.current` with null checks
2. **Cleanup Event Listeners** - Remove listeners in useEffect cleanup
3. **Use Refs for Performance** - `isSuspendedRef` doesn't cause re-renders
4. **Subscribe Early** - Set up event subscriptions in useEffect
5. **Type Safety** - Leverage TypeScript types for events and context

## Troubleshooting

### Map Not Accessible

**Issue:** `leafletMapRef.current` is `undefined`

**Solution:** Wait for map initialization

```tsx
useEffect(() => {
  const map = leafletMapRef.current;
  if (!map) {
    console.warn('Map not ready yet');
    return;
  }
  // Safe to use map
}, [leafletMapRef]);
```

### Events Not Firing

**Issue:** Event subscriptions don't work

**Solution:** Ensure subscription happens after provider mounts

```tsx
useEffect(() => {
  const unsub = subscribe(TopicMapCtxEvent.MapClicked, handler);
  return () => unsub();
}, [subscribe]); // Depend on subscribe function
```

## Related Packages

- **`@carma-mapping/engines/cesium`** - Cesium 3D engine integration
- **`@carma-mapping/map-transition-2d-3d`** - 2D/3D transition coordination
- **`@carma-mapping/components`** - Reusable map UI components
- **`react-cismap`** - Underlying Leaflet wrapper (peer dependency)

## Build

```sh
nx build engines/carma-cismap
```

## Test

```sh
nx test engines/carma-cismap
```

## Lint

```sh
nx lint engines/carma-cismap
```
