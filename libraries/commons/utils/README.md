# @carma-commons/utils

Common utilities and helper functions for CARMA applications.

> **Essential utilities** for arrays, routing, promises, styling, configuration, and more.

## Overview

This package provides a collection of utility functions used across CARMA applications:

- **Array Utilities** - Comparison and manipulation
- **Routing Helpers** - URL hash parameter management
- **Promise Utilities** - Timeout wrappers
- **Styling** - Tailwind CSS utilities and class name helpers
- **Configuration** - CARMA config extraction
- **Version Management** - Application version detection
- **String Utilities** - Random string generation
- **Layer Parsing** - WMS/Layer configuration extraction
- **Error Suppression** - Selective error filtering

## Installation

```bash
npm install @carma-commons/utils
```

## Utilities

### Array Utilities

#### `isNumberArrayEqual()`

Compare two number arrays for equality.

```typescript
import { isNumberArrayEqual } from "@carma-commons/utils";

const arr1 = [1, 2, 3];
const arr2 = [1, 2, 3];
const arr3 = [1, 2, 4];

isNumberArrayEqual(arr1, arr2); // true
isNumberArrayEqual(arr1, arr3); // false
```

**Use Cases:**
- Compare color arrays (RGBA)
- Verify coordinate equality
- Validate array-based configurations

### Routing Utilities

#### `getHashParams()`

Extract parameters from URL hash.

```typescript
import { getHashParams } from "@carma-commons/utils";

// URL: #/map?lat=51.2&lng=7.1&zoom=12
const params = getHashParams();
// { lat: "51.2", lng: "7.1", zoom: "12" }
```

#### `updateHashHistoryState()`

Update URL hash with new parameters.

```typescript
import { updateHashHistoryState } from "@carma-commons/utils";

updateHashHistoryState({
  lat: 51.2,
  lng: 7.1,
  zoom: 12
});
// Updates URL to #/map?lat=51.2&lng=7.1&zoom=12
```

#### `diffHashParams()`

Compare current and previous hash parameters.

```typescript
import { diffHashParams } from "@carma-commons/utils";

const diff = diffHashParams(
  { lat: "51.2", zoom: "12" },
  { lat: "51.3", zoom: "12" }
);
// Returns changes: { lat: { old: "51.2", new: "51.3" } }
```

**Use Cases:**
- URL-based state management
- Deep linking to map positions
- Browser history integration

### Promise Utilities

#### `promiseWithTimeout()`

Wrap a promise with a timeout.

```typescript
import { promiseWithTimeout } from "@carma-commons/utils";

const fetchData = async () => {
  const response = await fetch("https://api.example.com/data");
  return response.json();
};

try {
  const data = await promiseWithTimeout(fetchData(), 5000);
  console.log("Data:", data);
} catch (error) {
  console.error("Request timed out or failed");
}
```

**Parameters:**
- `promise: Promise<T>` - Promise to wrap
- `timeoutMs: number` - Timeout in milliseconds

**Use Cases:**
- API calls with timeout
- Resource loading with fallback
- Prevent hanging requests

### Styling Utilities

#### `cn()`

Combine class names with conditional logic (clsx wrapper).

```typescript
import { cn } from "@carma-commons/utils";

const className = cn(
  "base-class",
  isActive && "active",
  isDisabled && "disabled",
  { "large": size === "large" }
);
```

**Use Cases:**
- Conditional Tailwind classes
- Dynamic styling
- Component class composition

#### `TAILWIND_CLASSNAMES_FULLSCREEN_FIXED`

Predefined Tailwind classes for fullscreen fixed elements.

```typescript
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

function FullscreenOverlay() {
  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      {/* Content */}
    </div>
  );
}
```

**Value:** `"fixed inset-0 w-full h-full"`

### Configuration Utilities

#### `extractCarmaConfig()`

Extract CARMA-specific configuration from complex objects.

```typescript
import { extractCarmaConfig } from "@carma-commons/utils";

const config = extractCarmaConfig(rawConfig);
```

**Use Cases:**
- Parse deployment configurations
- Extract environment-specific settings
- Normalize configuration formats

### Version Management

#### `getApplicationVersion()`

Get application version information.

```typescript
import { getApplicationVersion, type VersionData } from "@carma-commons/utils";

const version: VersionData = getApplicationVersion();
// {
//   version: "1.2.3",
//   buildDate: "2024-01-15",
//   commit: "abc123"
// }
```

**Use Cases:**
- Display version in UI
- Debug information
- API version headers

### String Utilities

#### `generateRandomString()`

Generate a random alphanumeric string.

```typescript
import { generateRandomString } from "@carma-commons/utils";

const id = generateRandomString(16);
// "a3b5c7d9e1f2g4h6"
```

**Parameters:**
- `length: number` - Length of generated string

**Use Cases:**
- Generate unique IDs
- Session tokens
- Temporary identifiers

### Layer Parsing

#### `extractInformation()`

Extract layer configuration from WMS/WFS definitions.

```typescript
import { extractInformation } from "@carma-commons/utils";

const layerInfo = extractInformation(wmsCapabilities);
// {
//   name: "Buildings",
//   bounds: [...],
//   crs: "EPSG:25832",
//   ...
// }
```

**Use Cases:**
- Parse WMS GetCapabilities responses
- Extract layer metadata
- Configure map layers

### Error Handling

#### `suppressReactCismapErrors()`

Suppress specific react-cismap console errors.

```typescript
import { suppressReactCismapErrors } from "@carma-commons/utils";

// In app initialization
suppressReactCismapErrors();
```

**Use Cases:**
- Clean up console output
- Hide known non-critical warnings
- Improve developer experience

### Options Normalization

#### `normalizeOptions()`

Normalize and validate configuration options.

```typescript
import { normalizeOptions } from "@carma-commons/utils";

const normalized = normalizeOptions(userOptions, defaults);
```

**Use Cases:**
- Validate user input
- Apply default values
- Sanitize configurations

## Common Patterns

### Deep Link to Map Position

```typescript
import { updateHashHistoryState, getHashParams } from "@carma-commons/utils";

function useMapUrlSync(map) {
  useEffect(() => {
    // Initialize from URL
    const params = getHashParams();
    if (params.lat && params.lng && params.zoom) {
      map.setView(
        [parseFloat(params.lat), parseFloat(params.lng)],
        parseInt(params.zoom)
      );
    }
    
    // Update URL on map move
    const handleMoveEnd = () => {
      const center = map.getCenter();
      updateHashHistoryState({
        lat: center.lat.toFixed(6),
        lng: center.lng.toFixed(6),
        zoom: map.getZoom()
      });
    };
    
    map.on('moveend', handleMoveEnd);
    return () => map.off('moveend', handleMoveEnd);
  }, [map]);
}
```

### Safe Async Operations

```typescript
import { promiseWithTimeout } from "@carma-commons/utils";

async function loadResourceSafely(url: string) {
  try {
    const response = await promiseWithTimeout(
      fetch(url),
      5000 // 5 second timeout
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Failed to load resource:", error);
    return null; // Fallback
  }
}
```

### Conditional Styling

```typescript
import { cn } from "@carma-commons/utils";

function Button({ 
  variant, 
  size, 
  disabled, 
  className 
}: ButtonProps) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded font-medium transition-colors",
        variant === "primary" && "bg-blue-500 text-white hover:bg-blue-600",
        variant === "secondary" && "bg-gray-200 text-gray-800 hover:bg-gray-300",
        size === "small" && "text-sm px-2 py-1",
        size === "large" && "text-lg px-6 py-3",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
```

### Unique ID Generation

```typescript
import { generateRandomString } from "@carma-commons/utils";

function useUniqueId(prefix = "id") {
  const [id] = useState(() => `${prefix}-${generateRandomString(8)}`);
  return id;
}

// Usage
function Component() {
  const inputId = useUniqueId("input");
  
  return (
    <>
      <label htmlFor={inputId}>Name</label>
      <input id={inputId} type="text" />
    </>
  );
}
```

## Best Practices

1. **Import Only What You Need** - Tree-shaking friendly
2. **Type Safety** - Use TypeScript types from exports
3. **Error Handling** - Wrap promises with timeout for critical operations
4. **URL State** - Use hash params for shareable map states
5. **Unique IDs** - Generate IDs for form accessibility

## Related Packages

- **`@carma-commons/math`** - Mathematical utilities and constants
- **`@carma-commons/geo`** - Geographic and coordinate utilities
- **`@carma-commons/dom-window`** - Browser window and DOM helpers
- **`@carma-mapping/engines/cesium`** - Uses routing utilities for camera state
- **`@carma-mapping/engines/carma-cismap`** - Uses error suppression

## Build

```sh
nx build utils
```

## Test

```sh
nx test utils
```

## Lint

```sh
nx lint utils
```
