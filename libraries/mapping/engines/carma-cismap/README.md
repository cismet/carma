# carma-cismap

Augmented context provider for react-cismap TopicMapComponent with event bus for engine-level coordination.

## Features

- CarmaTopicMapContextProvider - wraps react-cismap TopicMapContextProvider
- Event bus for TopicMap-specific events
- Suspended/Active state management
- Event-driven architecture

## Usage

```typescript
import { CarmaTopicMapContextProvider, TopicMapCtxEvent } from '@carma-mapping/engines/carma-cismap';

// Replaces react-cismap TopicMapContextProvider
<CarmaTopicMapContextProvider infoBoxPixelWidth={350}>
  {/* Your app content with TopicMapComponent */}
</CarmaTopicMapContextProvider>

// Access the context in hooks - includes both Carma and react-cismap context
import { useCarmaTopicMapContext } from '@carma-mapping/engines/carma-cismap';

const { 
  // Carma context
  isSuspendedRef,   // MutableRefObject<boolean> - tracks suspended state
  subscribe,        // Subscribe to TopicMapCtxEvent
  emit,             // Emit TopicMapCtxEvent
  leafletMap,       // L.Map | undefined - direct access to Leaflet map (simplified!)
  isMapReady,       // boolean - true when leaflet map is fully initialized
  
  // react-cismap context (forwarded)
  routedMapRef,     // Original react-cismap ref (if needed)
  setAppMenuVisible,
  // ... all other react-cismap TopicMapContext properties
} = useCarmaTopicMapContext();

// Before: routedMapRef.leafletMap.leafletElement
// After:  leafletMap (direct access!)

// Wait for map to be ready before interacting with it
useEffect(() => {
  if (isMapReady && leafletMap) {
    // Safe to interact with leaflet map
    leafletMap.setZoom(10);
  }
}, [isMapReady, leafletMap]);
