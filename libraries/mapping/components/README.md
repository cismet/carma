# @carma-mapping/components

Reusable UI components for mapping applications supporting both 2D (Leaflet) and 3D (Cesium) map engines.

> **Engine-agnostic map controls and UI components** with consistent styling and behavior across 2D and 3D views.

## Overview

This package provides a collection of pre-built React components for common mapping UI patterns:

- **Map Controls** - Zoom, fullscreen, locate, new window
- **Layer Management** - Layer buttons, icons, type switchers
- **Loading States** - Tileset loading progress indicators
- **Responsive Design** - Mobile warnings and adaptive layouts
- **Accessibility** - ARIA labels and keyboard navigation

## Components

### RoutedMapLocateControl

Geolocation control with URL hash integration.

```tsx
import { RoutedMapLocateControl } from "@carma-mapping/components";

function MapControls() {
  return (
    <RoutedMapLocateControl
      onLocationFound={(coords) => {
        console.log("User location:", coords);
      }}
    />
  );
}
```

**Features:**
- Browser geolocation API integration
- Updates URL hash with location
- Custom styling support
- Error handling for denied permissions

### ZoomControl

Zoom in/out buttons for both 2D and 3D maps.

```tsx
import { ZoomControl } from "@carma-mapping/components";

function MapControls() {
  return <ZoomControl />;
}
```

**Features:**
- Automatically detects map engine (Leaflet/Cesium)
- Customizable button appearance
- Keyboard shortcuts support
- Smooth zoom animations

### FullscreenControl

Toggle fullscreen mode with multiple variants.

```tsx
import { 
  FullscreenControl,
  SimpleFullscreenControl,
  NewWindowControl 
} from "@carma-mapping/components";

function MapControls() {
  return (
    <>
      <FullscreenControl />
      <SimpleFullscreenControl />
      <NewWindowControl targetUrl="/map" />
    </>
  );
}
```

**Variants:**
- `FullscreenControl` - Full feature set with state management
- `SimpleFullscreenControl` - Lightweight version
- `NewWindowControl` - Opens map in new window/tab

**Features:**
- Browser Fullscreen API integration
- Fallback for browsers without fullscreen support
- ESC key to exit
- Custom icons

### LayerButton

Toggle layer visibility with icon support.

```tsx
import { LayerButton } from "@carma-mapping/components";

function LayerPanel() {
  const [isVisible, setIsVisible] = useState(true);
  
  return (
    <LayerButton
      label="Buildings"
      icon={<BuildingIcon />}
      isActive={isVisible}
      onClick={() => setIsVisible(!isVisible)}
    />
  );
}
```

**Features:**
- Active/inactive states
- Custom icons
- Tooltips
- Grouped button layouts

### LayerIcon

Render layer preview icons.

```tsx
import { LayerIcon } from "@carma-mapping/components";

function LayerList() {
  return (
    <div>
      <LayerIcon
        type="polygon"
        color="#FF0000"
        size={24}
      />
      <LayerIcon
        type="line"
        color="#0000FF"
        size={24}
      />
    </div>
  );
}
```

**Supported Types:**
- `polygon` - Filled polygon icon
- `line` - Line/polyline icon
- `point` - Point/marker icon
- `raster` - Raster layer icon

### MapTypeSwitcher

Switch between different map base layers or styles.

```tsx
import { MapTypeSwitcher } from "@carma-mapping/components";

function MapControls() {
  return (
    <MapTypeSwitcher
      options={[
        { id: "street", label: "Street", preview: "/street.png" },
        { id: "satellite", label: "Satellite", preview: "/sat.png" },
        { id: "terrain", label: "Terrain", preview: "/terrain.png" }
      ]}
      selected="street"
      onChange={(id) => console.log("Switched to:", id)}
    />
  );
}
```

**Features:**
- Visual previews of map types
- Keyboard navigation
- Responsive dropdown
- Integrates with Cesium scene styles

### TilesetLoadingProgress

Display loading progress for 3D tilesets.

```tsx
import { TilesetLoadingProgress } from "@carma-mapping/components";

function CesiumMap() {
  return (
    <>
      <TilesetLoadingProgress />
      {/* Cesium viewer */}
    </>
  );
}
```

**Features:**
- Automatic progress tracking from Cesium context
- Smooth progress bar animations
- Shows/hides based on loading state
- Customizable appearance

### MobileWarningMessage

Display warnings on mobile devices.

```tsx
import { MobileWarningMessage } from "@carma-mapping/components";

function App() {
  return (
    <>
      <MobileWarningMessage
        message="3D view works best on desktop devices"
        dismissible={true}
      />
      <MapView />
    </>
  );
}
```

**Features:**
- Device detection
- Dismissible with localStorage persistence
- Custom messages
- Responsive positioning

## Styling

All components support customization via:

1. **CSS Classes** - BEM-style class names
2. **Inline Styles** - Style prop override
3. **Theme Context** - Global theme provider (optional)
4. **Tailwind CSS** - Compatible with Tailwind utility classes

### Example: Custom Styling

```tsx
import { ZoomControl } from "@carma-mapping/components";

function CustomZoom() {
  return (
    <ZoomControl
      className="my-zoom-control"
      style={{ 
        position: 'absolute',
        right: '20px',
        top: '100px'
      }}
    />
  );
}
```

## Integration Patterns

### With Cesium Engine

```tsx
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import { 
  ZoomControl,
  FullscreenControl,
  TilesetLoadingProgress 
} from "@carma-mapping/components";

function CesiumMap() {
  return (
    <CesiumContextProvider config={cesiumConfig}>
      <div className="map-container">
        <CesiumViewer />
        
        <div className="map-controls">
          <ZoomControl />
          <FullscreenControl />
        </div>
        
        <TilesetLoadingProgress />
      </div>
    </CesiumContextProvider>
  );
}
```

### With Leaflet Engine

```tsx
import { CarmaTopicMapContextProvider } from "@carma-mapping/engines/carma-cismap";
import { 
  ZoomControl,
  RoutedMapLocateControl,
  LayerButton 
} from "@carma-mapping/components";

function LeafletMap() {
  return (
    <CarmaTopicMapContextProvider>
      <div className="map-container">
        <TopicMapComponent />
        
        <div className="map-controls">
          <ZoomControl />
          <RoutedMapLocateControl />
          <LayerButton label="POIs" />
        </div>
      </div>
    </CarmaTopicMapContextProvider>
  );
}
```

### With Map Transitions

```tsx
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";
import { MapTypeSwitcher } from "@carma-mapping/components";

function HybridMap() {
  const { transitionTo2d, transitionTo3d } = useMapTransition();
  
  return (
    <TransitionContextProvider>
      <MapTypeSwitcher
        options={[
          { id: "2d", label: "2D View" },
          { id: "3d", label: "3D View" }
        ]}
        onChange={(id) => {
          if (id === "3d") transitionTo3d();
          else transitionTo2d();
        }}
      />
    </TransitionContextProvider>
  );
}
```

## Accessibility

All components follow WCAG 2.1 AA guidelines:

- **Keyboard Navigation** - Tab, Enter, Escape support
- **ARIA Labels** - Screen reader compatible
- **Focus Management** - Visible focus indicators
- **Color Contrast** - Minimum 4.5:1 ratio
- **Touch Targets** - Minimum 44x44px tap areas

### Example: Enhanced Accessibility

```tsx
<ZoomControl
  aria-label="Map zoom controls"
  zoomInLabel="Zoom in"
  zoomOutLabel="Zoom out"
/>
```

## Responsive Design

Components adapt to different screen sizes:

```tsx
function ResponsiveControls() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <>
      {isMobile ? (
        <SimpleFullscreenControl />
      ) : (
        <FullscreenControl />
      )}
    </>
  );
}
```

## Best Practices

1. **Group Related Controls** - Use consistent positioning
2. **Consistent Iconography** - Use same icon set across components
3. **Progressive Enhancement** - Provide fallbacks for older browsers
4. **Performance** - Lazy load heavy components
5. **Testing** - Use data-testid attributes for E2E tests

### Example: Organized Control Layout

```tsx
function MapInterface() {
  return (
    <div className="map-wrapper">
      {/* Top-right corner */}
      <div className="controls-top-right">
        <MapTypeSwitcher />
        <FullscreenControl />
      </div>
      
      {/* Bottom-right corner */}
      <div className="controls-bottom-right">
        <ZoomControl />
        <RoutedMapLocateControl />
      </div>
      
      {/* Left sidebar */}
      <div className="controls-left">
        <LayerButton label="Buildings" />
        <LayerButton label="Roads" />
        <LayerButton label="Terrain" />
      </div>
      
      {/* Loading overlay */}
      <TilesetLoadingProgress />
    </div>
  );
}
```

## Related Packages

- **`@carma-mapping/engines/cesium`** - Cesium 3D engine integration
- **`@carma-mapping/engines/carma-cismap`** - Leaflet 2D engine wrapper
- **`@carma-mapping/map-transition-2d-3d`** - 2D/3D transition coordination
- **`@carma-mapping/ui/pitching-compass`** - Compass control component

## Build

```sh
nx build mapping/components
```

## Test

```sh
nx test mapping/components
```

## Lint

```sh
nx lint mapping/components
```
